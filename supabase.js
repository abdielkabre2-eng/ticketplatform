// supabase.js
// On utilise 'var' et une vérification pour éviter les erreurs de redéclaration
if (typeof window.SUPABASE_URL === 'undefined') {
    window.SUPABASE_URL = "https://didtpgzelaqlwbrujqdv.supabase.co";
    window.SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpZHRwZ3plbGFxbHdicnVqcWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NzA1MjYsImV4cCI6MjEwMTI0NjUyNn0.DRaDzyuWqtTRA7AMWUambDWQ9tP16G0ckzxwWRVxj6k";

    // Initialisation du client dans une variable globale
    window.supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);

    console.log("Connexion Supabase initialisée avec succès !");
} else {
    console.log("Supabase était déjà initialisé.");
}