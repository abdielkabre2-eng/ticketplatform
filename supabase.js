// supabase.js
const SUPABASE_URL = "https://didtpgzelaqlwbrujqdv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpZHRwZ3plbGFxbHdicnVqcWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NzA1MjYsImV4cCI6MjEwMTI0NjUyNn0.DRaDzyuWqtTRA7AMWUambDWQ9tP16G0ckzxwWRVxj6k";

// On redéfinit directement 'supabase' pour qu'elle soit compatible avec tout ton code existant
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("Connexion Supabase chargée :", supabase);