import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const BUCKET = 'preuves';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

/* =============================================
   FONCTION UPLOAD STORAGE
============================================= */
async function uploaderFichier(supabase, fichier, dossier) {
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

export default async function handler(req, res) {
  // Sécurité : éviter l'erreur 500 si les variables d'environnement sont absentes
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ success: false, error: "Variables d'environnement SUPABASE_URL ou SUPABASE_KEY manquantes sur Vercel." });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Méthode non autorisée" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { action, ...payload } = req.body || {};

  try {
    switch (action) {
      case "verifier_existence_evenement":
        return await verifierExistenceEvenement(supabase, payload, res);

      case "verifier_session":
        return await verifierSession(supabase, payload, res);

      case "a_mot_de_passe":
        return await aMotDePasse(supabase, payload, res);

      case "creer_mot_de_passe":
        return await creerMotDePasse(supabase, payload, res);

      case "login":
        return await login(supabase, payload, res);

      case "verifier_code_recuperation":
        return await verifierCodeRecuperation(supabase, payload, res);

      case "reinitialiser_mot_de_passe":
        return await reinitialiserMotDePasse(supabase, payload, res);

      case "logout":
        return await logout(supabase, payload, res);

      case "charger_evenement":
        return await chargerEvenement(supabase, payload, res);

      case "charger_billets":
        return await chargerBillets(supabase, payload, res);

      case "changer_statut":
        return await changerStatut(supabase, payload, res);

      case "retirer_participant":
        return await retirerParticipant(supabase, payload, res);

      case "verifier_billet":
        return await verifierBillet(supabase, payload, res);

      case "toggle_ventes":
        return await toggleVentes(supabase, payload, res);
        
      case "definir_limites_categories":
        return await definirLimitesCategories(supabase, payload, res);

      case "modifier_evenement":
        return await modifierEvenement(supabase, payload, res);

      case "modifier_affiche":
        return await modifierAffiche(supabase, payload, res);

      default:
        return res.status(400).json({ success: false, error: "Action inconnue." });
    }
  } catch (err) {
    console.error("Erreur /api/organisateur :", err);
    return res.status(500).json({ success: false, error: "Erreur serveur inattendue." });
  }
}

/* =============================================
   VÉRIFICATION EXISTENCE ÉVÉNEMENT
============================================= */
async function verifierExistenceEvenement(supabase, payload, res) {
  const { evenementId } = payload;
  if (!evenementId) {
    return res.status(400).json({ success: false, error: "evenementId manquant." });
  }

  const { data, error } = await supabase
    .from("evenements")
    .select("id, titre")
    .eq("id", evenementId)
    .single();

  if (error || !data) {
    return res.status(200).json({ success: true, exists: false, titre: null });
  }
  return res.status(200).json({ success: true, exists: true, titre: data.titre || null });
}

/* =============================================
   AUTHENTIFICATION
============================================= */
async function verifierSession(supabase, payload, res) {
  const { evenementId, token } = payload;
  if (!evenementId || !token) {
    return res.status(400).json({ success: false, error: "Paramètres manquants." });
  }

  const { data, error } = await supabase.rpc("organisateur_verifier_session", {
    p_evenement_id: evenementId,
    p_token: token,
  });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  return res.status(200).json({ success: true, valide: data === true });
}

async function aMotDePasse(supabase, payload, res) {
  const { evenementId } = payload;
  if (!evenementId) {
    return res.status(400).json({ success: false, error: "evenementId manquant." });
  }

  const { data, error } = await supabase.rpc("organisateur_a_mot_de_passe", {
    p_evenement_id: evenementId,
  });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  return res.status(200).json({ success: true, aMotDePasse: data === true });
}

async function creerMotDePasse(supabase, payload, res) {
  const { evenementId, motDePasse } = payload;
  if (!evenementId || !motDePasse) {
    return res.status(400).json({ success: false, error: "Paramètres manquants." });
  }
  if (motDePasse.length < 6) {
    return res.status(400).json({ success: false, error: "Le mot de passe doit contenir au moins 6 caractères." });
  }

  const { data, error } = await supabase.rpc("organisateur_creer_mot_de_passe", {
    p_evenement_id: evenementId,
    p_mot_de_passe: motDePasse,
  });

  if (error) {
    return res.status(500).json({ success: false, error: error.message || "Erreur lors de la création du mot de passe." });
  }
  return res.status(200).json({ success: true, code: data });
}

async function login(supabase, payload, res) {
  const { evenementId, motDePasse } = payload;
  if (!evenementId || !motDePasse) {
    return res.status(400).json({ success: false, error: "Paramètres manquants." });
  }

  const { data, error } = await supabase.rpc("organisateur_login", {
    p_evenement_id: evenementId,
    p_mot_de_passe: motDePasse,
  });

  if (error || !data) {
    return res.status(401).json({ success: false, error: "Mot de passe incorrect." });
  }
  return res.status(200).json({ success: true, token: data });
}

async function verifierCodeRecuperation(supabase, payload, res) {
  const { evenementId, code } = payload;
  if (!evenementId || !code) {
    return res.status(400).json({ success: false, error: "Paramètres manquants." });
  }

  const { data, error } = await supabase.rpc("organisateur_verifier_code_recuperation", {
    p_evenement_id: evenementId,
    p_code: code,
  });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  return res.status(200).json({ success: true, valide: data === true });
}

async function reinitialiserMotDePasse(supabase, payload, res) {
  const { evenementId, code, nouveauMotDePasse } = payload;
  if (!evenementId || !code || !nouveauMotDePasse) {
    return res.status(400).json({ success: false, error: "Paramètres manquants." });
  }
  if (nouveauMotDePasse.length < 6) {
    return res.status(400).json({ success: false, error: "Le mot de passe doit contenir au moins 6 caractères." });
  }

  const { data, error } = await supabase.rpc("organisateur_reinitialiser_mot_de_passe", {
    p_evenement_id: evenementId,
    p_code: code,
    p_nouveau_mot_de_passe: nouveauMotDePasse,
  });

  if (error) {
    return res.status(500).json({ success: false, error: error.message || "Erreur lors de la réinitialisation." });
  }
  return res.status(200).json({ success: true, nouveauCode: data });
}

async function logout(supabase, payload, res) {
  const { evenementId, token } = payload;
  if (!evenementId || !token) {
    return res.status(400).json({ success: false, error: "Paramètres manquants." });
  }

  const { error } = await supabase.rpc("organisateur_logout", {
    p_evenement_id: evenementId,
    p_token: token,
  });

  if (error) {
    return res.status(200).json({ success: true, warning: error.message });
  }
  return res.status(200).json({ success: true });
}

/* =============================================
   ESPACE ORGANISATEUR
============================================= */
async function chargerEvenement(supabase, payload, res) {
  const { evenementId, token } = payload;
  if (!evenementId || !token) {
    return res.status(400).json({ success: false, error: "Paramètres manquants." });
  }

  const { data, error } = await supabase.rpc("organisateur_charger_evenement", {
    p_evenement_id: evenementId,
    p_token: token,
  });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  const ev = data && data.length > 0 ? data[0] : null;
  return res.status(200).json({ success: true, event: ev });
}

async function chargerBillets(supabase, payload, res) {
  const { evenementId, token } = payload;
  if (!evenementId || !token) {
    return res.status(400).json({ success: false, error: "Paramètres manquants." });
  }

  const { data, error } = await supabase.rpc("organisateur_charger_billets", {
    p_evenement_id: evenementId,
    p_token: token,
  });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  return res.status(200).json({ success: true, billets: data || [] });
}

async function changerStatutAncien(supabase, payload, res) {
  const { evenementId, token, billetId, nouveauStatut } = payload;
  if (!evenementId || !token || !billetId || !nouveauStatut) {
    return res.status(400).json({ success: false, error: "Paramètres manquants." });
  }

  const { error } = await supabase.rpc("organisateur_changer_statut", {
    p_evenement_id: evenementId,
    p_token: token,
    p_billet_id: billetId,
    p_nouveau_statut: nouveauStatut,
  });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  let billetContact = null;
  if (nouveauStatut === "confirme") {
    const { data: unBillet } = await supabase
      .from("billets")
      .select("email, nom_participant, code_public")
      .eq("id", billetId)
      .single();
    billetContact = unBillet || null;
  }

  return res.status(200).json({ success: true, billet: billetContact });
}

async function retirerParticipant(supabase, payload, res) {
  const { evenementId, token, billetId } = payload;
  if (!evenementId || !token || !billetId) {
    return res.status(400).json({ success: false, error: "Paramètres manquants." });
  }

  const { error } = await supabase.rpc("organisateur_retirer_participant", {
    p_evenement_id: evenementId,
    p_token: token,
    p_billet_id: billetId,
  });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  return res.status(200).json({ success: true });
}

/* =============================================
   SCANNER
============================================= */
async function verifierBillet(supabase, payload, res) {
  const { evenementId, token, codeScanne } = payload;
  if (!evenementId || !token || !codeScanne) {
    return res.status(400).json({ success: false, error: "Paramètres manquants." });
  }

  const { data, error } = await supabase.rpc("organisateur_verifier_billet", {
    p_evenement_id: evenementId,
    p_token: token,
    p_code_scanne: codeScanne,
  });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  const res0 = data && data.length > 0 ? data[0] : null;
  return res.status(200).json({ success: true, resultat_scan: res0 });
}

/* =============================================
   GESTION ÉVÉNEMENT & VENTES
============================================= */
async function toggleVentes(supabase, payload, res) {
  const { evenementId, token, nouveauStatut } = payload;
  if (!evenementId || !token || typeof nouveauStatut !== "boolean") {
    return res.status(400).json({ success: false, error: "Paramètres manquants ou invalides." });
  }

  const { error } = await supabase.rpc("organisateur_toggle_ventes", {
    p_evenement_id: evenementId,
    p_token: token,
    p_nouveau_statut: nouveauStatut,
  });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  return res.status(200).json({ success: true });
}

async function definirLimitesCategories(supabase, payload, res) {
  const { evenementId, token, limites } = payload;
  if (!evenementId || !token || typeof limites !== "object" || limites === null) {
    return res.status(400).json({ success: false, error: "Paramètres manquants ou invalides." });
  }
  // Validation : chaque valeur doit être null ou un entier >= 0
  for (const valeur of Object.values(limites)) {
    const valide = valeur === null || (typeof valeur === "number" && Number.isInteger(valeur) && valeur >= 0);
    if (!valide) {
      return res.status(400).json({ success: false, error: "Valeur de limite invalide." });
    }
  }
  const { error } = await supabase.rpc("organisateur_definir_limites_categories", {
    p_evenement_id: evenementId,
    p_token: token,
    p_limites: limites,
  });
  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  return res.status(200).json({ success: true });
}

async function modifierEvenement(supabase, payload, res) {
  const { evenementId, token, titre, date, heure, lieu, categoriesData, beneficiaireNom, beneficiaireInfos } = payload;
  if (!evenementId || !token || !titre || !date || !heure || !lieu) {
    return res.status(400).json({ success: false, error: "Paramètres manquants." });
  }

  const { error } = await supabase.rpc("organisateur_modifier_evenement", {
    p_evenement_id: evenementId,
    p_token: token,
    p_titre: titre,
    p_date: date,
    p_heure: heure,
    p_lieu: lieu,
    p_categories_data: categoriesData || null,
    p_beneficiaire_nom: beneficiaireNom || null,
    p_beneficiaire_infos: beneficiaireInfos || null,
  });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  return res.status(200).json({ success: true });
}

async function modifierAffiche(supabase, payload, res) {
  const { evenementId, token, fileAffiche } = payload;
  if (!evenementId || !token || !fileAffiche) {
    return res.status(400).json({ success: false, error: "Paramètres manquants." });
  }

  let afficheUrl;
  try {
    afficheUrl = await uploaderFichier(supabase, fileAffiche, 'affiches');
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }

  const { error } = await supabase.rpc("organisateur_modifier_affiche", {
    p_evenement_id: evenementId,
    p_token: token,
    p_affiche_url: afficheUrl,
  });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  return res.status(200).json({ success: true, affiche_url: afficheUrl });
}

/* =============================================
   ENVOI D'E-MAILS (Resend)
============================================= */
function echapperHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

async function envoyerEmailResend({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) {
    console.error("RESEND_API_KEY ou MAIL_FROM manquant sur Vercel.");
    return false;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!r.ok) {
      console.error("Erreur Resend :", r.status, await r.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("Erreur réseau Resend :", e);
    return false;
  }
}

function emailBilletHtml(nom, lien) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#fffbeb;">
    <h2 style="color:#b45309;margin:0 0 16px;">GoldTix 🎫</h2>
    <p>Bonjour <strong>${nom}</strong>,</p>
    <p>Votre paiement a bien été reçu. Votre billet est prêt !</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${lien}" style="background:#d97706;color:#ffffff;padding:14px 26px;border-radius:10px;text-decoration:none;font-weight:bold;">Voir mon billet</a>
    </p>
    <p style="font-size:12px;color:#64748b;">Présentez le QR code de votre billet à l'entrée de l'événement.</p>
  </div>`;
}


function emailRefusHtml(nom, lienWhatsApp) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;">
    <h2 style="color:#b45309;margin:0 0 24px;">GoldTix 🎫</h2>

    <h3 style="color:#111827;">Paiement non confirmé</h3>

    <p>Bonjour <strong>${nom}</strong>,</p>

    <p>Nous n'avons pas pu confirmer la réception de votre paiement.</p>

    <p>Si vous avez déjà effectué le transfert, contactez directement le bénéficiaire de l'événement afin de vérifier votre transaction.</p>

    ${
      lienWhatsApp
        ? `<div style="text-align:center;margin:28px 0;">
            <a href="${lienWhatsApp}"
               style="display:inline-block;background:#25D366;color:#ffffff;padding:14px 20px;border-radius:10px;text-decoration:none;font-weight:bold;">
              Contacter le bénéficiaire sur WhatsApp
            </a>
          </div>`
        : `<p>Veuillez contacter directement le bénéficiaire de l'événement pour vérifier votre paiement.</p>`
    }

    <p style="font-size:12px;color:#64748b;margin-top:24px;">
      Ce message a été envoyé automatiquement par GoldTix.
    </p>
  </div>`;
}

function creerLienWhatsApp(beneficiaireInfos) {
  const numero = String(beneficiaireInfos || "")
    .replace(/[^\d+]/g, "")
    .replace(/^\+/, "");

  // Pour le Burkina Faso : indicatif 226 + 8 chiffres
  if (!/^226\d{8}$/.test(numero)) {
    return null;
  }

  const message =
    "Bonjour, je vous contacte concernant mon paiement pour votre événement sur GoldTix. Pouvez-vous m'aider à vérifier ma transaction ?";

  return `https://wa.me/${numero}?text=${encodeURIComponent(message)}`;
}

async function changerStatut(supabase, payload, res) {
  const { evenementId, token, billetId, nouveauStatut } = payload;
  if (!evenementId || !token || !billetId || !nouveauStatut) {
    return res.status(400).json({ success: false, error: "Paramètres manquants." });
  }

  const { data: avant } = await supabase
    .from("billets").select("statut").eq("id", billetId).single();
  const ancienStatut = avant ? avant.statut : null;

  const { error } = await supabase.rpc("organisateur_changer_statut", {
    p_evenement_id: evenementId,
    p_token: token,
    p_billet_id: billetId,
    p_nouveau_statut: nouveauStatut,
  });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  let emailEnvoye = null;
  const doitEnvoyer =
    (nouveauStatut === "confirme" || nouveauStatut === "refuse") &&
    ancienStatut !== nouveauStatut;

  if (doitEnvoyer) {
    const { data: b } = await supabase
      .from("billets")
      .select("email, nom_participant, code_public")
      .eq("id", billetId)
      .single();

    if (b && b.email) {
      const nom = echapperHtml(b.nom_participant || "");
      if (nouveauStatut === "confirme") {
       const lien = `https://ticketplatform-kappa.vercel.app/billet.html?id=${encodeURIComponent(b.code_public)}`;
        emailEnvoye = await envoyerEmailResend({
          to: b.email,
          subject: "Votre billet GoldTix est prêt 🎫",
          html: emailBilletHtml(nom, lien),
        });
      
} else {
  const { data: evenement, error: erreurEvenement } =
    await supabase
      .from("evenements")
      .select("beneficiaire_infos")
      .eq("id", evenementId)
      .maybeSingle();

  if (erreurEvenement) {
    console.error(
      "Erreur récupération bénéficiaire :",
      erreurEvenement.message
    );
  }

  const lienWhatsApp = creerLienWhatsApp(
    evenement?.beneficiaire_infos
  );

  emailEnvoye = await envoyerEmailResend({
    to: b.email,
    subject: "Paiement non reçu - GoldTix",
    html: emailRefusHtml(nom, lienWhatsApp),
  });
}
    }
  }

  return res.status(200).json({ success: true, email_envoye: emailEnvoye });
}