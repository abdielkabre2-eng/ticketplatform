// ==========================================
// 1. PARTICIPANT : ACHAT DU BILLET + UPLOAD PREUVE
// ==========================================

let boutonPaiement = document.getElementById("paiement");

if (boutonPaiement) {
    boutonPaiement.onclick = async function (e) {
        if (e) e.preventDefault();

        let nomInput = document.getElementById("nom");
        let telephoneInput = document.getElementById("telephone");
        let preuveInput = document.getElementById("preuvePaiement"); // Utilise l'ID exact de achat.html

        let nom = nomInput ? nomInput.value.trim() : "";
        let telephone = telephoneInput ? telephoneInput.value.trim() : "";
        let fichierPreuve = preuveInput && preuveInput.files ? preuveInput.files[0] : null;

        if (!nom || !telephone) {
            alert("Veuillez remplir votre nom et votre numéro WhatsApp.");
            return;
        }

        if (!fichierPreuve) {
            alert("Veuillez joindre la capture d'écran de votre preuve de paiement.");
            return;
        }

        let numero = "JEEAM-" + Math.floor(Math.random() * 100000);
        let urlPreuvePublic = "";

        try {
            boutonPaiement.disabled = true;
            boutonPaiement.textContent = "Téléversement de la preuve...";

            // 1. Envoi de la preuve vers Supabase Storage (Bucket "preuves")
            let fileExt = fichierPreuve.name.split('.').pop();
            let fileName = `${numero}-${Date.now()}.${fileExt}`;

            const { data: uploadData, error: uploadError } = await window.supabaseClient
                .storage
                .from("preuves")
                .upload(fileName, fichierPreuve);

            if (uploadError) {
                console.error("Erreur d'upload :", uploadError);
                alert("Erreur lors de l'envoi de l'image : " + uploadError.message);
                return;
            }

            // Récupération de l'URL publique de l'image
            const { data: urlData } = window.supabaseClient
                .storage
                .from("preuves")
                .getPublicUrl(fileName);

            urlPreuvePublic = urlData.publicUrl;

            boutonPaiement.textContent = "Enregistrement du billet...";

            // 2. Insertion dans la table 'billets'
            const { data, error } = await window.supabaseClient
                .from("billets")
                .insert([
                    {
                        numero_billet: numero,
                        nom: nom,
                        telephone: telephone,
                        paiement: "attente",
                        entree: "non_utilise",
                        preuve_url: urlPreuvePublic
                    }
                ])
                .select();

            if (error) {
                console.error("Erreur Supabase :", error);
                alert("Erreur lors de l'enregistrement : " + error.message);
                return;
            }

            localStorage.setItem("numeroBillet", numero);

            alert("Demande et preuve envoyées avec succès !");
            window.location.href = "attente.html";

        } catch (err) {
            console.error("Erreur inattendue :", err);
            alert("Une erreur est survenue lors de l'envoi.");
        } finally {
            boutonPaiement.disabled = false;
            boutonPaiement.textContent = "J'ai effectué le paiement";
        }
    };
}


// ==========================================
// 2. ADMINISTRATION : AFFICHAGE DES PREUVES & VALIDATION
// ==========================================

async function chargerDemandesAdmin() {
    let listeDemandes = document.getElementById("listeDemandes");
    if (!listeDemandes) return;

    listeDemandes.innerHTML = "<p>Chargement des demandes...</p>";

    const { data: billets, error } = await window.supabaseClient
        .from("billets")
        .select("*")
        .order("id", { ascending: false });

    if (error) {
        console.error("Erreur Supabase :", error);
        listeDemandes.innerHTML = "<p>Erreur lors du chargement des demandes.</p>";
        return;
    }

    if (!billets || billets.length === 0) {
        listeDemandes.innerHTML = "<p>Aucune demande de billet enregistrée.</p>";
        return;
    }

    listeDemandes.innerHTML = "";

    billets.forEach(function (billet, index) {
        let imagePreuveHTML = billet.preuve_url
            ? `<div style="margin: 10px 0;">
                <strong>Preuve de paiement :</strong><br>
                <a href="${billet.preuve_url}" target="_blank">
                    <img src="${billet.preuve_url}" alt="Preuve" style="max-width: 100%; max-height: 180px; border-radius: 6px; border: 1px solid #ddd; margin-top: 5px; object-fit: contain;">
                </a>
               </div>`
            : `<p style="color: gray;"><em>Aucune preuve fournie.</em></p>`;

        listeDemandes.innerHTML += `
        <div class="event-card" style="margin-bottom: 20px; padding: 15px; border: 1px solid #ccc; border-radius: 8px;">
            <h3>Demande ${index + 1}</h3>
            <p><strong>Numéro :</strong> ${billet.numero_billet}</p>
            <p><strong>Nom et prénom :</strong> ${billet.nom}</p>
            <p><strong>Téléphone :</strong> ${billet.telephone}</p>

            ${imagePreuveHTML}

            <p>
                <strong>Statut :</strong>
                <span class="etat-${billet.paiement}">
                    ${billet.paiement === "attente" ? "🟡 En attente" : ""}
                    ${billet.paiement === "confirme" ? "🟢 Paiement confirmé" : ""}
                    ${billet.paiement === "refuse" ? "🔴 Paiement refusé" : ""}
                </span>
            </p>

            <button class="confirm" onclick="validerPaiement('${billet.id}')">
                J'ai reçu
            </button>

            <button class="refuse" onclick="refuserPaiement('${billet.id}')">
                Je n'ai pas reçu
            </button>
        </div>
        `;
    });
}

if (document.getElementById("listeDemandes")) {
    chargerDemandesAdmin();
}

async function validerPaiement(idBillet) {
    const { error } = await window.supabaseClient
        .from("billets")
        .update({ paiement: "confirme", entree: "non_utilise" })
        .eq("id", idBillet);

    if (error) {
        alert("Erreur : " + error.message);
    } else {
        alert("Paiement confirmé !");
        chargerDemandesAdmin();
    }
}

async function refuserPaiement(idBillet) {
    const { error } = await window.supabaseClient
        .from("billets")
        .update({ paiement: "refuse" })
        .eq("id", idBillet);

    if (error) {
        alert("Erreur : " + error.message);
    } else {
        alert("Paiement refusé.");
        chargerDemandesAdmin();
    }
}


// ==========================================
// 3. BILLET & ATTENTE : LECTURE EN DIRECT
// ==========================================

async function chargerPageBillet() {
    let numero = localStorage.getItem("numeroBillet");
    let ticket = document.querySelector(".ticket");

    if (!ticket || !numero) return;

    const { data: demande, error } = await window.supabaseClient
        .from("billets")
        .select("*")
        .eq("numero_billet", numero)
        .single();

    if (error || !demande) {
        ticket.innerHTML = "<h2>Billet introuvable.</h2>";
        return;
    }

    let nomBillet = document.getElementById("nomBillet");
    let telephoneBillet = document.getElementById("telephoneBillet");
    let numeroBilletElem = document.getElementById("numeroBillet");
    let boutonDownload = document.getElementById("downloadTicket");
    let qr = document.getElementById("qrcode");

    if (demande.paiement === "confirme") {
        if (nomBillet) nomBillet.textContent = demande.nom;
        if (telephoneBillet) telephoneBillet.textContent = demande.telephone;
        if (numeroBilletElem) numeroBilletElem.textContent = demande.numero_billet;

        if (boutonDownload) boutonDownload.style.display = "block";

        if (qr) {
            qr.innerHTML = "";
            let urlVerification = window.location.origin + "/scanner.html?id=" + demande.numero_billet;

            if (typeof QRCode !== "undefined") {
                new QRCode(qr, {
                    text: urlVerification,
                    width: 120,
                    height: 120,
                    correctLevel: QRCode.CorrectLevel.H
                });
            }
        }
    } else if (demande.paiement === "refuse") {
        ticket.innerHTML = `
            <h2>🔴 Paiement refusé</h2>
            <p>Votre paiement n'a pas été validé par l'organisateur.</p>
            <p>Veuillez le contacter pour plus d'informations.</p>
        `;
        if (boutonDownload) boutonDownload.style.display = "none";
    } else {
        ticket.innerHTML = `
            <h2>🟡 Paiement en attente de validation...</h2>
            <p>Veuillez repasser sur cette page après la confirmation du bénéficiaire.</p>
        `;
        if (boutonDownload) boutonDownload.style.display = "none";
    }
}

if (document.querySelector(".ticket") || document.getElementById("qrcode")) {
    chargerPageBillet();
}


// ==========================================
// 4. TELECHARGEMENT PDF
// ==========================================

let boutonDownload = document.getElementById("downloadTicket");

if (boutonDownload) {
    boutonDownload.onclick = function () {
        let billet = document.querySelector(".ticket");

        if (typeof html2pdf !== "undefined") {
            html2pdf()
                .set({
                    margin: 5,
                    filename: "Mon_Billet_JEEAM.pdf",
                    image: { type: "jpeg", quality: 1 },
                    html2canvas: { scale: 3, useCORS: true, scrollY: 0 },
                    jsPDF: { unit: "mm", format: "a5", orientation: "portrait" }
                })
                .from(billet)
                .save();
        }
    };
}