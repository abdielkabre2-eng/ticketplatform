import { createClient } from "@supabase/supabase-js";
import formidable from "formidable";
import fs from "fs";
import { randomUUID } from "crypto";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Client créé une seule fois et réutilisé entre les appels d'une même instance serverless
let supabaseClient = null;
function getSupabase() {
  if (!supabaseClient) supabaseClient = createClient(supabaseUrl, supabaseKey);
  return supabaseClient;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

// Formats de preuve acceptés (identiques à ceux acceptés par la page d'achat)
const TYPE_PAR_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const EXTENSION_PAR_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export default async function handler(req, res) {
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Variables d'environnement SUPABASE_URL ou SUPABASE_KEY manquantes sur Vercel." });
  }

  const supabase = getSupabase();

  if (req.method === "GET") {
    return handleGet(req, res, supabase);
  }
  if (req.method === "POST") {
    return handlePost(req, res, supabase);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Méthode non autorisée" });
}

/* =============================================
   CALCUL DES DISPONIBILITÉS PAR CATÉGORIE
   -> ne s'exécute que si l'événement a au moins
      une limite définie (sinon "disponibilites"
      n'est même pas ajouté à la réponse, pour ne
      rien changer côté page d'achat).
============================================= */
async function ajouterDisponibilitesSiNecessaire(supabase, event) {
  const limites = event.limites_categories;
  if (!limites || typeof limites !== "object") return event;

  const categoriesLimitees = Object.entries(limites).filter(
    ([, limite]) => limite !== null && limite !== undefined
  );
  if (categoriesLimitees.length === 0) return event;

  // Lecture par pages de 1000 lignes : évite de sous-compter si Supabase
  // limite le nombre de lignes renvoyées par requête.
  const TAILLE_PAGE = 1000;
  const billetsActifs = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase
      .from("billets")
      .select("type_billet")
      .eq("evenement_id", event.id)
      .in("statut", ["attente", "confirme"])
      .order("id", { ascending: true })
      .range(page * TAILLE_PAGE, page * TAILLE_PAGE + TAILLE_PAGE - 1);

    if (error) return event; // en cas d'erreur, on n'affiche rien plutôt que des chiffres faux
    billetsActifs.push(...(data || []));
    if (!data || data.length < TAILLE_PAGE) break;
  }

  const comptages = {};
  billetsActifs.forEach((b) => {
    const nomCategorie = (b.type_billet || "").split(" - ")[0];
    comptages[nomCategorie] = (comptages[nomCategorie] || 0) + 1;
  });

  const disponibilites = {};
  categoriesLimitees.forEach(([nom, limite]) => {
    const restant = Math.max(0, limite - (comptages[nom] || 0));
    disponibilites[nom] = { limite, restant, epuise: restant <= 0 };
  });

  return { ...event, disponibilites };
}

async function handleGet(req, res, supabase) {
  const eventId = req.query.event;
  const ticketId = req.query.id;

  if (eventId) {
    const { data, error } = await supabase
      .from("evenements")
      .select("*")
      .eq("id", eventId)
      .single();

    // "Introuvable" uniquement si la base dit réellement qu'il n'y a aucune ligne
    // (PGRST116) ou que l'identifiant est mal formé (22P02). Toute autre erreur
    // (panne passagère, délai dépassé...) est renvoyée comme une erreur : la page
    // affiche alors « Connexion impossible » avec le bouton Réessayer, au lieu de
    // « Événement supprimé ».
    if (error && error.code !== "PGRST116" && error.code !== "22P02") {
      console.error("Erreur /api/tickets GET evenement :", error);
      return res.status(500).json({ error: "Erreur temporaire, veuillez réessayer." });
    }

    if (error || !data) {
      return res.status(200).json({ event: null });
    }

    const eventAvecDispo = await ajouterDisponibilitesSiNecessaire(supabase, data);

    // Cache très court partagé : lors d'un pic, les visiteurs et le rafraîchissement
    // automatique (30 s) partagent la même réponse. L'achat reste vérifié en base
    // (acheter_billet_transactionnel), donc aucun risque de dépassement de quota.
    // Pour désactiver : supprimer la ligne ci-dessous.
    res.setHeader("Cache-Control", "public, s-maxage=5, stale-while-revalidate=10");
    return res.status(200).json({ event: eventAvecDispo });
  }

  if (ticketId) {
    const { data: ticket, error: errTicket } = await supabase
      .from("billets")
      .select("*")
      .eq("code_public", ticketId)
      .single();

    if (errTicket || !ticket) {
      return res.status(404).json({ ticket: null, event: null });
    }

    const { data: event } = await supabase
      .from("evenements")
      .select("*")
      .eq("id", ticket.evenement_id)
      .single();

    return res.status(200).json({ ticket, event });
  }

  return res.status(400).json({ error: "Paramètre 'event' ou 'id' manquant" });
}

async function handlePost(req, res, supabase) {
  let cheminTemporaire = null;
  try {
    const { fields, files } = await parseFormulaire(req);

    const eventId = premierChamp(fields.event);
    const nom = premierChamp(fields.nom_participant);
    const email = premierChamp(fields.email) || null;
    const telephone = premierChamp(fields.telephone);
    const typeBillet = premierChamp(fields.type_billet) || "Standard";
    const fichierPreuve = files.preuve && (Array.isArray(files.preuve) ? files.preuve[0] : files.preuve);

    if (fichierPreuve && fichierPreuve.filepath) cheminTemporaire = fichierPreuve.filepath;

    if (!eventId || !nom || !telephone || !fichierPreuve) {
      return res.status(400).json({ success: false, error: "Champs obligatoires manquants." });
    }

    // Seules les images JPG / PNG / WEBP sont acceptées (comme sur la page d'achat)
    const extensionNom = (fichierPreuve.originalFilename || "").split(".").pop().toLowerCase();
    const extension = EXTENSION_PAR_TYPE[fichierPreuve.mimetype] || (TYPE_PAR_EXTENSION[extensionNom] ? extensionNom : null);
    if (!extension) {
      return res.status(400).json({ success: false, error: "Format de preuve non accepté. Utilisez une image JPG, PNG ou WEBP." });
    }

    const donneesFichier = await fs.promises.readFile(fichierPreuve.filepath);
    // Nom aléatoire non devinable (les preuves de paiement sont des données sensibles)
    const nomFichier = `preuve-${randomUUID()}.${extension}`;

    const { error: erreurUpload } = await supabase
      .storage
      .from("preuves")
      .upload(nomFichier, donneesFichier, {
        contentType: TYPE_PAR_EXTENSION[extension],
        cacheControl: "3600",
        upsert: false,
      });

    if (erreurUpload) {
      return res.status(500).json({ success: false, error: "Erreur lors de l'envoi de la preuve : " + erreurUpload.message });
    }

    const { data: urlData } = supabase.storage.from("preuves").getPublicUrl(nomFichier);

    // Vérification ET insertion se font désormais dans une seule fonction
    // transactionnelle côté base (verrou sur la ligne événement), pour
    // empêcher tout dépassement de quota lors d'achats simultanés.
    const { data: billetInsere, error: erreurAchat } = await supabase.rpc(
      "acheter_billet_transactionnel",
      {
        p_evenement_id: eventId,
        p_nom_participant: nom,
        p_email: email,
        p_telephone: telephone,
        p_type_billet: typeBillet,
        p_preuve_url: urlData.publicUrl,
      }
    );

    if (erreurAchat) {
      const messageBrut = erreurAchat.message || "";
      // Refus métier connus : aucun billet n'a été créé, on supprime la preuve envoyée
      // (meilleure tentative, sans effet sur la réponse). Pour toute autre erreur on la
      // conserve par prudence : le billet a pu être créé malgré l'erreur.
      const refusMetier = ["VENTES_FERMEES", "CATEGORIE_EPUISEE", "EVENEMENT_INTROUVABLE"].find((c) => messageBrut.includes(c));
      if (refusMetier) {
        await supprimerPreuve(supabase, nomFichier);
      }
      if (messageBrut.includes("VENTES_FERMEES")) {
        return res.status(409).json({ success: false, code: "VENTES_FERMEES", error: "La vente des billets pour cet évènement vient d'être fermée." });
      }
      if (messageBrut.includes("CATEGORIE_EPUISEE")) {
        return res.status(409).json({ success: false, code: "CATEGORIE_EPUISEE", error: "Cette catégorie de billets vient d'être épuisée. Veuillez choisir une autre catégorie. Si vous avez déjà effectué le paiement, contactez le bénéficiaire avec la preuve pour un remboursement." });
      }
      if (messageBrut.includes("EVENEMENT_INTROUVABLE")) {
        return res.status(404).json({ success: false, code: "EVENEMENT_INTROUVABLE", error: "Événement introuvable." });
      }
      return res.status(500).json({ success: false, error: "Erreur lors de l'enregistrement du billet." });
    }

    if (!billetInsere) {
      return res.status(500).json({ success: false, error: "Erreur lors de l'enregistrement du billet." });
    }

    return res.status(200).json({ success: true, id: billetInsere.id, code_public: billetInsere.code_public });

  } catch (err) {
    console.error("Erreur /api/tickets POST :", err);
    return res.status(500).json({ success: false, error: "Erreur serveur inattendue." });
  } finally {
    // Nettoyage du fichier temporaire (évite de saturer /tmp entre deux appels)
    if (cheminTemporaire) {
      fs.promises.unlink(cheminTemporaire).catch(() => {});
    }
  }
}

async function supprimerPreuve(supabase, nomFichier) {
  try {
    await supabase.storage.from("preuves").remove([nomFichier]);
  } catch (e) {
    console.error("Suppression de la preuve orpheline impossible :", e);
  }
}

function parseFormulaire(req) {
  const form = formidable({ maxFileSize: 10 * 1024 * 1024 });
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