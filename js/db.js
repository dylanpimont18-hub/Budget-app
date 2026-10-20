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

// ── Authentification ───────────────────────────────────────────────────

function messageAuth(error) {
  const code = error?.code ?? '';
  const texte = error?.message ?? '';
  if (!navigator.onLine) return 'Pas de connexion internet.';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(texte)) return 'Email ou mot de passe incorrect';
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(texte)) return 'Confirme ton email (lien reçu par mail)';
  if (code === 'user_already_exists' || /already registered/i.test(texte)) return 'Un compte existe déjà avec cet email';
  if (code === 'weak_password' || /password/i.test(texte)) return 'Mot de passe trop faible (8 caractères minimum)';
  if (/rate limit/i.test(texte) || code.startsWith('over_')) return 'Trop de tentatives, réessaie dans quelques minutes';
  if (code === 'validation_failed' || /invalid.*email|email.*invalid/i.test(texte)) return 'Adresse email invalide';
  return 'Connexion impossible, réessaie.';
}

export async function connecter(email, mdp) {
  const {data, error} = await sb.auth.signInWithPassword({email, password: mdp});
  if (error) throw new Error(messageAuth(error));
  return data.session;
}

// Renvoie la session, ou null si l'email doit d'abord être confirmé
export async function inscrire(email, mdp) {
  const {data, error} = await sb.auth.signUp({
    email,
    password: mdp,
    options: {emailRedirectTo: location.origin + location.pathname},
  });
  if (error) throw new Error(messageAuth(error));
  return data.session;
}

export async function deconnecter() {
  const {error} = await sb.auth.signOut();
  if (error) throw erreur(error, 'Déconnexion impossible.');
}

// ── Foyer ──────────────────────────────────────────────────────────────

const MESSAGES_RPC = {
  code_invalide: 'Code inconnu',
  deja_membre: 'Tu fais déjà partie d\'un foyer',
  prenom_requis: 'Indique ton prénom',
  non_connecte: 'Session expirée, reconnecte-toi',
  pas_de_foyer: 'Aucun foyer pour ce compte',
  mois_invalide: 'Mois invalide',
};

function verifierRpc({data, error}, message) {
  if (error) throw erreur(error, MESSAGES_RPC[error.message] ?? message);
  return data;
}

// {foyer, membres, moi} ou null si le compte n'a pas encore de foyer
export async function chargerFoyer() {
  const s = await session();
  if (!s) return null;
  const moi = verifier(await sb.from('membres').select('*').eq('user_id', s.user.id).maybeSingle(),
    'Impossible de charger ton profil.');
  if (!moi) return null;
  const [foyer, membres] = await Promise.all([
    sb.from('foyers').select('*').eq('id', moi.foyer_id).single(),
    sb.from('membres').select('*').eq('foyer_id', moi.foyer_id).order('prenom'),
  ]);
  return {
    foyer: verifier(foyer, 'Impossible de charger le foyer.'),
    membres: verifier(membres, 'Impossible de charger les membres.'),
    moi,
  };
}

export async function creerFoyer(prenom) {
  return verifierRpc(await sb.rpc('creer_foyer', {p_prenom: prenom}), 'Création du foyer impossible.');
}

export async function rejoindreFoyer(code, prenom) {
  return verifierRpc(await sb.rpc('rejoindre_foyer', {p_code: code, p_prenom: prenom}), 'Impossible de rejoindre le foyer.');
}
