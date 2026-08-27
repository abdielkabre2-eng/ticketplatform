// /api/super-admin.js
// Endpoint serverless pour l'espace Super Organisateur de GoldTix.
// Aligné sur le même style que /api/tickets et /api/organisateur :
// - une seule route POST
// - un switch par "action"
// - client Supabase créé avec SUPABASE_URL / SUPABASE_KEY (variables d'env serveur)

import { createClient } from '@supabase/supabase-js';

// Les fichiers (affiche + RIB) arrivent en base64 dans le JSON : on augmente
// la limite par défaut du bodyParser Vercel (1 Mo) pour ne pas rejeter les images.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const BUCKET = 'preuves';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { action } = req.body || {};

  try {
    switch (action) {
      case 'lister_evenements':
        return await listerEvenements(req, res);

      case 'creer_evenement':
        return await creerEvenement(req, res);

      case 'supprimer_evenement':
        return await supprimerEvenement(req, res);

      default:
        return res.status(400).json({ error: 'Action inconnue : ' + action });
    }
  } catch (err) {
    console.error('Erreur /api/super-admin :', err);
    return res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
}

// ---------------------------------------------------------------------------
// Action : lister_evenements
// ---------------------------------------------------------------------------
async function listerEvenements(req, res) {
  const { data, error } = await supabase
    .from('evenements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return res.status(200).json({ evenements: data || [] });
}

// ---------------------------------------------------------------------------
// Action : creer_evenement
// Attend dans req.body :
// {
//   action: 'creer_evenement',
//   titre, date, heure, lieu,
//   nombre_categories, categories_data,
//   beneficiaire_nom, beneficiaire_infos,
//   fileAffiche: { nom, type, data (base64 sans le préfixe data:...) },
//   fileRib:     { nom, type, data (base64 sans le préfixe data:...) }
// }
// ---------------------------------------------------------------------------
async function creerEvenement(req, res) {
  const {
    titre,
    date,
    heure,
    lieu,
    nombre_categories,
    categories_data,
    beneficiaire_nom,
    beneficiaire_infos,
    fileAffiche,
    fileRib,
  } = req.body;

  if (!titre || !date || !heure || !lieu || !beneficiaire_nom || !beneficiaire_infos) {
    return res.status(400).json({ error: 'Champs obligatoires manquants.' });
  }
  if (!fileAffiche || !fileRib) {
    return res.status(400).json({ error: "L'affiche et l'image du RIB/QR code sont obligatoires." });
  }

  const afficheUrl = await uploaderFichier(fileAffiche, 'affiches');
  const ribUrl = await uploaderFichier(fileRib, 'ribs');

  const nouvelEvenement = {
    titre,
    date,
    heure,
    lieu,
    nombre_categories,
    categories_data,
    affiche_url: afficheUrl,
    beneficiaire_nom,
    beneficiaire_infos,
    rib_image_url: ribUrl,
  };

  const { data, error } = await supabase
    .from('evenements')
    .insert([nouvelEvenement])
    .select();

  if (error) throw error;

  return res.status(200).json({ evenement: data[0] });
}

// ---------------------------------------------------------------------------
// Action : supprimer_evenement
// Attend { action: 'supprimer_evenement', id }
// ---------------------------------------------------------------------------
async function supprimerEvenement(req, res) {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "L'identifiant de l'événement est requis." });
  }

  // 1. Récupérer l'événement pour connaître les fichiers à supprimer du storage
  const { data: evenement, error: errLecture } = await supabase
    .from('evenements')
    .select('affiche_url, rib_image_url')
    .eq('id', id)
    .single();

  if (errLecture) {
    console.warn('Avertissement (lecture événement) :', errLecture.message);
  }

  // 2. Supprimer les billets liés
  const { error: errBillets } = await supabase
    .from('billets')
    .delete()
    .eq('evenement_id', id);

  if (errBillets) {
    console.warn('Avertissement (billets) :', errBillets.message);
  }

  // 3. Supprimer les fichiers stockés (affiche + RIB/QR code)
  if (evenement) {
    const chemins = [
      extraireCheminStockage(evenement.affiche_url),
      extraireCheminStockage(evenement.rib_image_url),
    ].filter(Boolean);

    if (chemins.length > 0) {
      const { error: errStorage } = await supabase.storage.from(BUCKET).remove(chemins);
      if (errStorage) {
        console.warn('Avertissement (fichiers) :', errStorage.message);
      }
    }
  }

  // 4. Supprimer l'événement, avec vérification stricte (.select())
  const { data: dataEvenement, error: errEvenement } = await supabase
    .from('evenements')
    .delete()
    .eq('id', id)
    .select();

  if (errEvenement) throw errEvenement;

  if (!dataEvenement || dataEvenement.length === 0) {
    return res.status(404).json({
      error:
        "Aucun événement n'a été supprimé côté serveur. Vérifiez que l'id est correct.",
    });
  }

  return res.status(200).json({ success: true });
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
async function uploaderFichier(fichier, dossier) {
  const { nom, type, data } = fichier;
  const extension = (nom.split('.').pop() || 'bin').toLowerCase();
  const randomString = Math.random().toString(36).substring(2, 8);
  const cheminFichier = `${dossier}/${Date.now()}_${randomString}.${extension}`;

  const buffer = Buffer.from(data, 'base64');

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(cheminFichier, buffer, {
      contentType: type || 'application/octet-stream',
      upsert: false,
    });

  if (error) throw new Error("Erreur d'upload : " + error.message);

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(cheminFichier);

  return publicUrlData.publicUrl;
}

function extraireCheminStockage(urlPublique) {
  if (!urlPublique) return null;
  const marqueur = `/${BUCKET}/`;
  const index = urlPublique.indexOf(marqueur);
  if (index === -1) return null;
  return urlPublique.substring(index + marqueur.length);
}