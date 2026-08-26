import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  const { event } = req.query;

  if (!event) {
    return res.status(400).json({ error: 'ID événement manquant' });
  }

  try {
    // 1. Récupérer l'événement
    const { data: eventData, error: eventError } = await supabase
      .from('evenements')
      .select('*')
      .eq('id', event)
      .single();

    if (eventError) throw eventError;

    // 2. Récupérer les billets liés
    const { data: ticketsData, error: ticketsError } = await supabase
      .from('type_billet')
      .select('*')
      .eq('evenement_id', event);

    if (ticketsError) throw ticketsError;

    // 3. Renvoyer le tout
    return res.status(200).json({ event: eventData, tickets: ticketsData });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}