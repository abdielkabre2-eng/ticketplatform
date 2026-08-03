const SUPABASE_URL = "https://didtpgzelaqlwbrujqdv.supabase.co";

const SUPABASE_KEY = "sb_publishable_O0_XPNEzfVg1h25CHBrQ3Q_ZxVOP1L9";

window.supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

console.log("Connexion Supabase chargée :", window.supabaseClient);