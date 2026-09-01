import { createClient } from "@supabase/supabase-js";
import formidable from "formidable";
import fs from "fs";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Désactiver le parseur JSON par défaut pour gérer le formulaire multipart/form-data
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // Sécurité : éviter l'erreur 500 si les variables d'environnement sont absentes
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Variables d'environnement SUPABASE_URL ou SUPABASE_KEY manquantes sur Vercel." });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  if (req.method === "GET") {
    return handleGet(req, res, supabase);
  }
  if (req.method === "POST") {
    return handlePost(req, res, supabase);
  }
  
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Méthode non autorisée" });
}

async function handleGet(req, res, supabase) {
  const eventId = req.query.event;
  const ticketId = req.query.id;

  // Option A : Recherche d'un événement (pour index.html)
  if (eventId) {
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

  // Option B : Recherche d'un billet + son événement (pour billet.html)
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

    const { data: ev, error: errEv } = await supabase
      .from("evenements")
      .select("ventes_fermees, limite_billets")
      .eq("id", eventId)
      .single();

    if (errEv || !ev) {
      return res.status(404).json({ success: false, error: "Événement introuvable." });
    }
    if (ev.ventes_fermees) {
      return res.status(409).json({ success: false, error: "La vente des billets pour cet évènement vient d'être fermée." });
    }

    // Vérification serveur du quota (miroir de la jauge affichée côté organisateur) :
    // on ne fait confiance qu'à un comptage frais en base, jamais à une valeur
    // envoyée par le client, pour empêcher un dépassement par soumission manuelle.
    if (ev.limite_billets !== null && ev.limite_billets !== undefined) {
      const { count: nombreOccupantLeQuota, error: errCount } = await supabase
        .from("billets")
        .select("id", { count: "exact", head: true })
        .eq("evenement_id", eventId)
        .in("statut", ["attente", "confirme"]);

      if (errCount) {
        return res.status(500).json({ success: false, error: "Erreur lors de la vérification du quota." });
      }
      if (nombreOccupantLeQuota >= ev.limite_billets) {
        return res.status(409).json({ success: false, error: "Le quota de billets disponibles pour cet évènement est atteint." });
      }
    }


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

    return res.status(200).json({ success: true, id: billetInsere[0].id, code_public: billetInsere[0].code_public });

  } catch (err) {
    console.error("Erreur /api/tickets POST :", err);
    return res.status(500).json({ success: false, error: "Erreur serveur inattendue." });
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