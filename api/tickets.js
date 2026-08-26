// api/tickets.js
//
// Fonction serverless Vercel (Node.js). S'exécute sur les serveurs de
// Vercel, jamais dans le navigateur du visiteur — c'est pour ça que le
// SDK Supabase et sa clé peuvent être utilisés ici en toute sécurité,
// même si l'appel direct depuis un téléphone posait problème.
//
// Nécessite : npm install @supabase/supabase-js formidable
//
// Variables d'environnement à définir sur Vercel (Project Settings > 
// Environment Variables) :
//   SUPABASE_URL              = https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = la clé "service_role" (secrète, jamais
//                                la clé "anon" utilisée côté client)

import { createClient } from "@supabase/supabase-js";
import formidable from "formidable";
import fs from "fs";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Nécessaire pour désactiver le parseur JSON automatique de Vercel,
// puisqu'on doit lire nous-mêmes le multipart/form-data (fichier + champs).
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "POST") {
    return handlePost(req, res);
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Méthode non autorisée" });
}

// ────────────────────────────────────────────────────────────────
// GET /api/tickets?event=ID  →  { event: {...} } ou { event: null }
// ────────────────────────────────────────────────────────────────
async function handleGet(req, res) {
  const eventId = req.query.event;
  if (!eventId) {
    return res.status(400).json({ error: "Paramètre 'event' manquant" });
  }

  const { data, error } = await supabase
    .from("evenements")
    .select("*")
    .eq("id", eventId)
    .single();

  if (error || !data) {
    return res.status(200).json({ event: null });
  }

  return res.status(200).json({ event: data });
}

// ────────────────────────────────────────────────────────────────
// POST /api/tickets  (multipart/form-data)
//   champs : event, nom_participant, email, telephone, type_billet
//   fichier : preuve
// →  { success: true, id: <billetId> }  ou  { success: false, error }
// ────────────────────────────────────────────────────────────────
async function handlePost(req, res) {
  try {
    const { fields, files } = await parseFormulaire(req);

    const eventId = premierChamp(fields.event);
    const nom = premierChamp(fields.nom_participant);
    const email = premierChamp(fields.email) || null;
    const telephone = premierChamp(fields.telephone);
    const typeBillet = premierChamp(fields.type_billet) || "Standard";
    const fichierPreuve = files.preuve && (Array.isArray(files.preuve) ? files.preuve[0] : files.preuve);

    if (!eventId || !nom || !telephone || !fichierPreuve) {
      return res.status(400).json({ success: false, error: "Champs obligatoires manquants." });
    }

    // Revérifie que les ventes ne sont pas fermées entre-temps
    const { data: ev, error: errEv } = await supabase
      .from("evenements")
      .select("ventes_fermees")
      .eq("id", eventId)
      .single();

    if (errEv || !ev) {
      return res.status(404).json({ success: false, error: "Événement introuvable." });
    }
    if (ev.ventes_fermees) {
      return res.status(409).json({ success: false, error: "La vente des billets pour cet évènement vient d'être fermée." });
    }

    // Upload de la preuve de paiement (côté serveur, jamais côté client)
    const donneesFichier = fs.readFileSync(fichierPreuve.filepath);
    const extension = (fichierPreuve.originalFilename || "jpg").split(".").pop().toLowerCase();
    const nomFichier = `preuve-${Date.now()}-${Math.floor(Math.random() * 1000)}.${extension}`;

    const { error: erreurUpload } = await supabase
      .storage
      .from("preuves")
      .upload(nomFichier, donneesFichier, {
        contentType: fichierPreuve.mimetype || "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      });

    if (erreurUpload) {
      return res.status(500).json({ success: false, error: "Erreur lors de l'envoi de la preuve : " + erreurUpload.message });
    }

    const { data: urlData } = supabase.storage.from("preuves").getPublicUrl(nomFichier);

    // Insertion du billet
    const { data: billetInsere, error: erreurInsertion } = await supabase
      .from("billets")
      .insert([{
        evenement_id: eventId,
        nom_participant: nom,
        email,
        telephone,
        preuve_url: urlData.publicUrl,
        type_billet: typeBillet,
        statut: "attente",
        utilise: false,
      }])
      .select();

    if (erreurInsertion || !billetInsere || billetInsere.length === 0) {
      return res.status(500).json({ success: false, error: "Erreur lors de l'enregistrement du billet." });
    }

    return res.status(200).json({ success: true, id: billetInsere[0].id });

  } catch (err) {
    console.error("Erreur /api/tickets POST :", err);
    return res.status(500).json({ success: false, error: "Erreur serveur inattendue." });
  }
}

function parseFormulaire(req) {
  const form = formidable({ maxFileSize: 10 * 1024 * 1024 }); // 10 Mo max
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

function premierChamp(valeur) {
  if (Array.isArray(valeur)) return valeur[0];
  return valeur;
}