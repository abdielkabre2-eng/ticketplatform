import { createClient } from "@supabase/supabase-js";
import { genererBilletPdf } from "./_billetPdf.js";

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

      case "creer_billet_especes":
        return await creerBilletEspeces(supabase, payload, res);

      case "renvoyer_email_billet":
        return await renvoyerEmailBillet(supabase, payload, res);

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

async function envoyerEmailResend({ to, subject, html, attachments }) {
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
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        ...(attachments ? { attachments } : {}),
      }),
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

function emailBilletHtml(nom, lien, avecPdf = false) {
  return `
  <div style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;padding:36px 24px;">

      <div style="padding-bottom:24px;border-bottom:1px solid #eeeeee;">
        <span style="font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#111111;">
          GoldTix<span style="color:#d4a017;">.</span>
        </span>
      </div>

      <div style="padding:32px 0 24px;">
        <p style="margin:0 0 12px;font-size:15px;line-height:24px;color:#374151;">
          Bonjour ${nom},
        </p>

        <h1 style="margin:0 0 16px;font-size:25px;line-height:34px;font-weight:700;letter-spacing:-0.6px;color:#111111;">
          Votre billet est prêt.
        </h1>

        <p style="margin:0;font-size:15px;line-height:25px;color:#4b5563;">
          Votre paiement a été confirmé. Vous pouvez consulter les détails de votre billet à tout moment en cliquant sur le bouton ci-dessous.
        </p>
      </div>

      <div style="padding:8px 0 32px;">
        <a href="${lien}" style="display:inline-block;padding:14px 24px;background:#111111;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:6px;">
          Détails du billet →
        </a>
      </div>

      <div style="padding:20px 0;border-top:1px solid #eeeeee;">
        <p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#6b7280;">
          Merci de présenter le QR code de votre billet à l’entrée.${avecPdf ? " Votre billet est également joint à cet e-mail au format PDF." : ""}
        </p>
        <p style="margin:16px 0 0;font-size:12px;line-height:20px;color:#9ca3af;">
          GoldTix · Votre accès, en toute simplicité.
        </p>
      </div>

    </div>
  </div>`;
}

function emailRefusHtml(nom, lienWhatsApp, lienBillet) {
  return `
  <div style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;padding:36px 24px;">

      <div style="padding-bottom:24px;border-bottom:1px solid #eeeeee;">
        <span style="font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#111111;">
          GoldTix<span style="color:#d4a017;">.</span>
        </span>
      </div>

      <div style="padding:32px 0 24px;">
        <p style="margin:0 0 12px;font-size:15px;line-height:24px;color:#374151;">
          Bonjour ${nom},
        </p>

        <h1 style="margin:0 0 16px;font-size:25px;line-height:34px;font-weight:700;letter-spacing:-0.6px;color:#111111;">
          Paiement non confirmé.
        </h1>

        <p style="margin:0 0 16px;font-size:15px;line-height:25px;color:#4b5563;">
          Nous n'avons pas pu confirmer la réception de votre paiement.
        </p>

        <p style="margin:0;font-size:15px;line-height:25px;color:#4b5563;">
          Si vous avez déjà effectué le transfert, contactez le bénéficiaire de l'événement afin de vérifier votre transaction.
        </p>
      </div>

      <div style="padding:8px 0 32px;">
        <a href="${lienWhatsApp || lienBillet}"
           style="display:inline-block;margin:0 10px 10px 0;padding:14px 24px;background:#111111;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:6px;">
          Contacter le bénéficiaire →
        </a><a href="${lienBillet}"
           style="display:inline-block;margin:0 10px 10px 0;padding:14px 24px;background:#111111;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:6px;">
          Voir les détails →
        </a>
      </div>

      <div style="padding:20px 0;border-top:1px solid #eeeeee;">
        <p style="margin:12px 0 0;font-size:12px;line-height:20px;color:#9ca3af;">
          GoldTix · Votre accès, en toute simplicité.
        </p>
      </div>

    </div>
  </div>`;
}


function creerLienWhatsApp(beneficiaireInfos) {
  const texte = String(beneficiaireInfos || "");

  // Premier numéro de téléphone trouvé dans le texte (espaces, points, tirets, parenthèses acceptés)
  const trouve = texte.match(/(?:\+|00)?\d[\d\s().-]{6,}\d/);
  if (!trouve) return null;

  const brut = trouve[0].trim();
  const aIndicatif = brut.startsWith("+") || brut.startsWith("00");
  let numero = brut.replace(/\D/g, "");
  if (brut.startsWith("00")) numero = numero.replace(/^00/, "");

  // Numéro local burkinabè (8 chiffres, sans indicatif) : on ajoute 226
  if (!aIndicatif && /^\d{8}$/.test(numero)) numero = "226" + numero;

  // Numéro local d'un autre pays (commence par 0, sans indicatif) : impossible de deviner le pays
  if (!aIndicatif && numero.startsWith("0")) return null;

  if (numero.length < (aIndicatif ? 7 : 9) || numero.length > 15) return null;

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
      .select("*")
      .eq("id", billetId)
      .single();

    if (b && b.email) {
      const nom = echapperHtml(b.nom_participant || "");
      const lienBillet = `https://www.goldtixbilletterie.site/billet.html?id=${encodeURIComponent(b.code_public)}`;

      if (nouveauStatut === "confirme") {
        // On prépare le billet en PDF. Si la génération échoue, l'e-mail part quand même, sans PDF.
        let attachments = null;
        try {
          const { data: evenementPdf, error: erreurEvPdf } = await supabase
            .from("evenements")
            .select("*")
            .eq("id", evenementId)
            .maybeSingle();

          if (erreurEvPdf) {
            console.error("Erreur lecture événement pour le PDF :", erreurEvPdf.message);
          }

          const pdf = await genererBilletPdf({
            billet: b,
            evenement: evenementPdf || {},
            lienBillet,
          });

          attachments = [
            {
              filename: `Billet-GoldTix-${b.code_public}.pdf`,
              content: pdf.toString("base64"),
            },
          ];
        } catch (e) {
          console.error("Erreur génération PDF du billet :", e);
          attachments = null;
        }

        emailEnvoye = await envoyerEmailResend({
          to: b.email,
          subject: "Votre billet GoldTix est prêt 🎫",
          html: emailBilletHtml(nom, lienBillet, !!attachments),
          attachments,
        });
      } else {
        const { data: evenement, error: erreurEvenement } = await supabase
          .from("evenements")
          .select("beneficiaire_infos")
          .eq("id", evenementId)
          .maybeSingle();

        if (erreurEvenement) {
          console.error("Erreur récupération bénéficiaire :", erreurEvenement.message);
        }

        const lienWhatsApp = creerLienWhatsApp(evenement?.beneficiaire_infos);

        emailEnvoye = await envoyerEmailResend({
          to: b.email,
          subject: "Paiement non reçu - GoldTix",
          html: emailRefusHtml(nom, lienWhatsApp, lienBillet),
        });
      }
    }
  }

  return res.status(200).json({ success: true, email_envoye: emailEnvoye });
}

/* =============================================
   BILLET CRÉÉ MANUELLEMENT (PAIEMENT EN ESPÈCES)
============================================= */

// Envoie à un participant son billet confirmé (même e-mail, même PDF que l'achat en ligne).
// Retourne true si l'e-mail est parti, false sinon. Ne lève jamais d'erreur.
async function envoyerBilletParEmail(supabase, billet, evenementId) {
  try {
    if (!billet || !billet.email) return false;

    const nom = echapperHtml(billet.nom_participant || "");
    const lienBillet = `https://www.goldtixbilletterie.site/billet.html?id=${encodeURIComponent(billet.code_public)}`;

    // On prépare le billet en PDF. Si la génération échoue, l'e-mail part quand même, sans PDF.
    let attachments = null;
    try {
      const { data: evenementPdf, error: erreurEvPdf } = await supabase
        .from("evenements")
        .select("*")
        .eq("id", evenementId)
        .maybeSingle();

      if (erreurEvPdf) {
        console.error("Erreur lecture événement pour le PDF :", erreurEvPdf.message);
      }

      const pdf = await genererBilletPdf({
        billet,
        evenement: evenementPdf || {},
        lienBillet,
      });

      attachments = [
        {
          filename: `Billet-GoldTix-${billet.code_public}.pdf`,
          content: pdf.toString("base64"),
        },
      ];
    } catch (e) {
      console.error("Erreur génération PDF du billet :", e);
      attachments = null;
    }

    return await envoyerEmailResend({
      to: billet.email,
      subject: "Votre billet GoldTix est prêt 🎫",
      html: emailBilletHtml(nom, lienBillet, !!attachments),
      attachments,
    });
  } catch (e) {
    console.error("Erreur envoi du billet par e-mail :", e);
    return false;
  }
}

async function creerBilletEspeces(supabase, payload, res) {
  const { evenementId, token, nomParticipant, email, telephone, categorieNom, cleIdempotence } = payload;

  if (
    !evenementId || !token ||
    !String(nomParticipant || "").trim() ||
    !String(email || "").trim() ||
    !String(telephone || "").trim() ||
    !String(categorieNom || "").trim() ||
    !cleIdempotence
  ) {
    return res.status(400).json({ success: false, error: "Paramètres manquants." });
  }

  const { data, error } = await supabase.rpc("organisateur_creer_billet_especes", {
    p_evenement_id: evenementId,
    p_token: token,
    p_nom_participant: nomParticipant,
    p_email: email,
    p_telephone: telephone,
    p_categorie_nom: categorieNom,
    p_cle_idempotence: String(cleIdempotence),
  });

  if (error) {
    const msg = String(error.message || "");
    if (msg.includes("CATEGORIE_EPUISEE")) {
      return res.status(409).json({ success: false, error: "Cette catégorie est épuisée." });
    }
    if (msg.includes("CATEGORIE_INVALIDE")) {
      return res.status(400).json({ success: false, error: "Catégorie invalide." });
    }
    if (msg.includes("EMAIL_INVALIDE")) {
      return res.status(400).json({ success: false, error: "Adresse e-mail invalide." });
    }
    if (msg.includes("NOM_OBLIGATOIRE")) {
      return res.status(400).json({ success: false, error: "Le nom et prénom sont obligatoires." });
    }
    if (msg.includes("TELEPHONE_OBLIGATOIRE")) {
      return res.status(400).json({ success: false, error: "Le numéro WhatsApp / téléphone est obligatoire." });
    }
    if (msg.includes("EVENEMENT_INTROUVABLE")) {
      return res.status(404).json({ success: false, error: "Événement introuvable." });
    }
    if (msg.toLowerCase().includes("session")) {
      return res.status(401).json({ success: false, error: msg });
    }
    console.error("Erreur création billet espèces :", msg);
    return res.status(500).json({ success: false, error: "Impossible de générer le billet : " + msg });
  }

  const billet = Array.isArray(data) ? data[0] : data;
  if (!billet || !billet.id) {
    return res.status(500).json({ success: false, error: "Le billet n'a pas pu être généré." });
  }

  // Soumission répétée (même clé) : si l'e-mail est déjà parti, on ne le renvoie pas une seconde fois.
  let emailEnvoye;
  if (billet.email_envoye === true) {
    emailEnvoye = true;
  } else {
    emailEnvoye = await envoyerBilletParEmail(supabase, billet, evenementId);

    // L'échec de l'e-mail n'annule jamais la création du billet : on note seulement le résultat.
    const { error: erreurMaj } = await supabase
      .from("billets")
      .update({ email_envoye: emailEnvoye })
      .eq("id", billet.id)
      .eq("evenement_id", evenementId);

    if (erreurMaj) {
      console.error("Erreur mise à jour email_envoye :", erreurMaj.message);
    }
  }

  return res.status(200).json({
    success: true,
    billet: { id: billet.id, code_public: billet.code_public },
    email_envoye: emailEnvoye,
  });
}

async function renvoyerEmailBillet(supabase, payload, res) {
  const { evenementId, token, billetId } = payload;
  if (!evenementId || !token || !billetId) {
    return res.status(400).json({ success: false, error: "Paramètres manquants." });
  }

  const { data: sessionValide, error: erreurSession } = await supabase.rpc("organisateur_verifier_session", {
    p_evenement_id: evenementId,
    p_token: token,
  });

  if (erreurSession) {
    return res.status(500).json({ success: false, error: erreurSession.message });
  }
  if (sessionValide !== true) {
    return res.status(401).json({ success: false, error: "Votre session a expiré, veuillez rafraîchir la page." });
  }

  const { data: billet, error: erreurBillet } = await supabase
    .from("billets")
    .select("*")
    .eq("id", billetId)
    .eq("evenement_id", evenementId)
    .maybeSingle();

  if (erreurBillet) {
    return res.status(500).json({ success: false, error: erreurBillet.message });
  }
  if (!billet) {
    return res.status(404).json({ success: false, error: "Billet introuvable pour cet événement." });
  }
  if (billet.statut !== "confirme") {
    return res.status(400).json({ success: false, error: "Ce billet n'est pas confirmé." });
  }
  if (!billet.email) {
    return res.status(400).json({ success: false, error: "Ce billet n'a pas d'adresse e-mail." });
  }

  const emailEnvoye = await envoyerBilletParEmail(supabase, billet, evenementId);

  const { error: erreurMaj } = await supabase
    .from("billets")
    .update({ email_envoye: emailEnvoye })
    .eq("id", billet.id)
    .eq("evenement_id", evenementId);

  if (erreurMaj) {
    console.error("Erreur mise à jour email_envoye :", erreurMaj.message);
  }

  return res.status(200).json({ success: true, email_envoye: emailEnvoye });
}