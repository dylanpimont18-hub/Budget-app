// Accès aux données : client Supabase et toutes les requêtes de l'app.
// Chaque fonction lève une Error au message en français si Supabase renvoie une erreur.
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import {SUPABASE_URL, SUPABASE_ANON_KEY} from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true},
});

function erreur(error, message) {
  console.error(error);
  if (!navigator.onLine) return new Error('Pas de connexion internet.');
  return new Error(message ?? 'Une erreur est survenue, réessaie.');
}

// Renvoie data ou lève une erreur lisible
function verifier({data, error}, message) {
  if (error) throw erreur(error, message);
  return data;
}

// ── Session ────────────────────────────────────────────────────────────

export async function session() {
  const {data, error} = await sb.auth.getSession();
  if (error) throw erreur(error, 'Impossible de lire la session.');
  return data.session;
}

export function surAuth(cb) {
  const {data} = sb.auth.onAuthStateChange((evenement, s) => cb(evenement, s));
  return () => data.subscription.unsubscribe();
}
