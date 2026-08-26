import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { event } = req.query;

  if (!event) {
    return res.status(400).json({ error: 'ID événement manquant' });
  }

  // Vérification de sécurité des variables d'environnement
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Variables SUPABASE_URL ou SUPABASE_KEY non configurées sur Vercel' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: eventData, error: eventError } = await supabase
      .from('evenements')
      .select('*')
      .eq('id', event)
      .single();

    if (eventError || !eventData) {
      return res.status(404).json({ error: 'Événement introuvable' });
    }

    return res.status(200).json({ event: eventData });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}