<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mon Billet - Événement</title>
    <link rel="stylesheet" href="style.css">
    <style>
        body { font-family: Arial, sans-serif; background: #f4f7f6; padding: 20px; text-align: center; }
        .ticket { max-width: 450px; margin: 0 auto; background: white; padding: 25px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); text-align: left; }
        .badge-attente { background: #ffc107; color: #333; padding: 10px; border-radius: 5px; font-weight: bold; text-align: center; margin-bottom: 20px; }
        .badge-refuse { background: #dc3545; color: white; padding: 10px; border-radius: 5px; font-weight: bold; text-align: center; margin-bottom: 20px; }
        
        /* Conteneur flexbox pour centrer parfaitement le QR code */
        .qr-container-wrapper { 
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 20px 0;
        }
        /* Cadre en pointillés ajusté sur mesure autour du QR code */
        #qrcode {
            padding: 10px;
            background: white;
            border: 2px dashed #333;
            border-radius: 8px;
            display: inline-block;
        }
        
        .info { font-size: 12px; color: #666; text-align: center; margin-top: 15px; }
        button { background: #007bff; color: white; border: none; padding: 12px; width: 100%; border-radius: 5px; font-weight: bold; cursor: pointer; margin-top: 20px; }
        button:hover { background: #0056b3; }
    </style>
</head>
<body>

    <div class="ticket" id="ticketContent">
        <h2 style="text-align: center;">Chargement de votre billet...</h2>
    </div>

    <button id="downloadTicket" style="max-width: 450px; display: none; margin: 20px auto;" onclick="telechargerPDF()">
        ⬇️ Télécharger mon billet
    </button>

    <!-- 1. Bibliothèque Supabase -->
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <!-- 2. Configuration Supabase -->
    <script src="supabase.js"></script>
    <!-- 3. Librairies QR Code et PDF -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>

    <script>
       async function chargerBillet() {
            const urlParams = new URLSearchParams(window.location.search);
            let billetId = urlParams.get("id");
            let container = document.getElementById("ticketContent");
            let btnDownload = document.getElementById("downloadTicket");

            if (!billetId) {
                container.innerHTML = "<h3>Erreur</h3><p>Aucun identifiant de billet trouvé.</p>";
                return;
            }

            // 1. Récupérer le billet
            const { data: b, error: errBillet } = await window.supabaseClient
                .from("billets")
                .select("*")
                .eq("id", billetId)
                .single();

            if (errBillet || !b) {
                container.innerHTML = "<h3>Oups</h3><p>Impossible de trouver ce billet.</p>";
                return;
            }

            // 2. Récupérer l'événement associé
            const { data: ev, error: errEv } = await window.supabaseClient
                .from("evenements")
                .select("*")
                .eq("id", b.evenement_id)
                .single();

            if (errEv || !ev) {
                container.innerHTML = "<h3>Oups</h3><p>Impossible de trouver l'événement lié à ce billet.</p>";
                return;
            }

            // Cas 1 : En attente
            if (b.paiement === "attente" || !b.paiement) {
                container.innerHTML = `
                    <div class="badge-attente">⏳ Paiement en attente de validation</div>
                    <h1>🎟️ ${ev.titre}</h1>
                    <hr>
                    <p>Merci <strong>${b.nom}</strong> ! Votre preuve de paiement a bien été transmise.</p>
                    <p>L'organisateur doit valider votre paiement. Cette page se mettra à jour dès que ce sera fait.</p>
                    <button onclick="location.reload()" style="background: #ffc107; color: #333; margin-top: 15px;">Rafraîchir la page</button>
                `;
                return;
            }

            // Cas 2 : Refusé
            if (b.paiement === "refuse") {
                container.innerHTML = `
                    <div class="badge-refuse">❌ Paiement non validé / Non reçu</div>
                    <h1 style="font-size: 20px;">🎟️ ${ev.titre}</h1>
                    <hr>
                    <p>Désolé <strong>${b.nom}</strong>, l'organisateur indique ne pas avoir reçu les fonds.</p>
                    
                    <div style="background: #fff3cd; padding: 12px; border-radius: 5px; margin: 15px 0; border: 1px solid #ffeeba; text-align: left;">
                        <p style="margin: 0; font-size: 14px; color: #856404;">
                            💡 <strong>Que faire ?</strong> Contactez l'organisateur au numéro : <strong>${ev.beneficiaire_infos}</strong> (${ev.beneficiaire_nom}).
                        </p>
                    </div>
                    <button onclick="location.reload()" style="background: #28a745; color: white; margin-top: 5px;">🔄 Vérifier à nouveau</button>
                `;
                return;
            }

            // Cas 3 : Confirmé (Affichage du Billet et du QR Code unique & centré)
            if (b.paiement === "confirme") {
                container.innerHTML = `
                    <h1 style="text-align: center;">🎟️ Billet d'entrée</h1>
                    <h2 style="text-align: center; color: #007bff;">${ev.titre}</h2>
                    <hr>
                    <p><strong>Nom et prénom :</strong> ${b.nom}</p>
                    <p><strong>Téléphone :</strong> ${b.telephone}</p>
                    <p><strong>Date :</strong> ${ev.date} à ${ev.heure}</p>
                    <p><strong>Lieu :</strong> ${ev.lieu}</p>
                    <p><strong>Billet N° :</strong> ${b.numero_billet}</p>

                    <div class="qr-container-wrapper">
                        <div id="qrcode"></div>
                    </div>

                    <p class="info">Veuillez présenter ce billet ou ce QR Code à l'entrée.</p>
                `;

                // Nettoyage et génération sécurisée du QR Code unique
                const qrContainer = document.getElementById("qrcode");
                qrContainer.innerHTML = "";

                new QRCode(qrContainer, {
                    text: b.numero_billet,
                    width: 140,
                    height: 140
                });

                btnDownload.style.display = "block";
                return;
            }
        }

        function telechargerPDF() {
            const element = document.getElementById('ticketContent');
            let opt = {
                margin:       10,
                filename:     'mon-billet.pdf',
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2 },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            html2pdf().from(element).set(opt).save();
        }

        chargerBillet();
    </script>
</body>
</html>