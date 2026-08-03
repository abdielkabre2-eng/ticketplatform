let resultat = document.getElementById("resultat");

async function verifierBillet(numeroBillet) {
    if (!resultat) return;

    resultat.innerHTML = `<p style="color: blue;">🔍 Vérification du billet ${numeroBillet} dans Supabase...</p>`;

    // 1. Interrogation de Supabase avec le numéro de billet
    const { data: billet, error } = await window.supabaseClient
        .from("billets")
        .select("*")
        .eq("numero_billet", numeroBillet)
        .single();

    // Cas : Billet introuvable dans la base de données
    if (error || !billet) {
        resultat.innerHTML = `
            <h2 style="color:red;">❌ Billet introuvable</h2>
            <p>Le numéro ${numeroBillet} n'existe pas dans le système.</p>
        `;
        return;
    }

    // Cas : Paiement non encore confirmé par l'organisateur
    if (billet.paiement !== "confirme") {
        resultat.innerHTML = `
            <h2 style="color:orange;">⚠️ Paiement non validé</h2>
            <p><strong>Participant :</strong> ${billet.nom}</p>
            <p>Le paiement de ce billet n'a pas encore été confirmé.</p>
        `;
        return;
    }

    // Cas : Billet déjà scanné à l'entrée
    if (billet.entree === "utilise") {
        resultat.innerHTML = `
            <h2 style="color:red;">⛔ Billet déjà utilisé</h2>
            <p><strong>Nom :</strong> ${billet.nom}</p>
            <p>Ce billet a déjà été validé à l'entrée !</p>
        `;
        return;
    }

    // Cas : Billet Valide -> On met à jour l'état 'entree' dans Supabase
    const { error: updateError } = await window.supabaseClient
        .from("billets")
        .update({ entree: "utilise" })
        .eq("id", billet.id);

    if (updateError) {
        resultat.innerHTML = `<h2 style="color:red;">Erreur de validation réseau</h2>`;
    } else {
        resultat.innerHTML = `
            <h2 style="color:green;">✅ Billet valide</h2>
            <p><strong>Participant :</strong> ${billet.nom}</p>
            <p><strong>Numéro :</strong> ${billet.numero_billet}</p>
            <p><strong>Entrée :</strong> AUTORISÉE</p>
        `;
    }
}

// 2. Initialisation du scanner QR avec la caméra
let scanner = new Html5QrcodeScanner(
    "reader",
    {
        fps: 10,
        qrbox: 250
    }
);

scanner.render(
    function (decodedText) {
        // Extraction du numéro du billet (ex: JEEAM-12345)
        let numeroMatch = decodedText.match(/JEEAM-\d+/);
        
        // Si l'URL contient un paramètre id=JEEAM-12345
        if (!numeroMatch && decodedText.includes("id=")) {
            let idPart = decodedText.split("id=")[1];
            numeroMatch = idPart ? idPart.match(/JEEAM-\d+/) : null;
        }

        if (numeroMatch) {
            verifierBillet(numeroMatch[0]);
        } else {
            resultat.innerHTML = `
                <h2 style="color:red;">❌ QR code invalide</h2>
                <p>Ce QR Code ne correspond pas à un format de billet valide.</p>
            `;
        }

        // Suspendre momentanément la caméra après un scan
        scanner.clear();
    },
    function (error) {
        // Ignorer les erreurs de balayage continu
    }
);