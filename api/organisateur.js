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
        
      case "definir_limite_billets":
        return await definirLimiteBillets(supabase, payload, res);

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

async function changerStatut(supabase, payload, res) {
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

async function definirLimiteBillets(supabase, payload, res) {
  const { evenementId, token, limiteBillets } = payload;
  const limiteValide =
    limiteBillets === null ||
    (typeof limiteBillets === "number" && Number.isInteger(limiteBillets) && limiteBillets >= 0);

  if (!evenementId || !token || !limiteValide) {
    return res.status(400).json({ success: false, error: "Paramètres manquants ou invalides." });
  }

  const { error } = await supabase.rpc("organisateur_definir_limite_billets", {
    p_evenement_id: evenementId,
    p_token: token,
    p_limite: limiteBillets,
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