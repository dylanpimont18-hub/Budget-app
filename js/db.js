// Accès aux données : client Supabase et toutes les requêtes de l'app.
// Chaque fonction lève une Error au message en français si Supabase renvoie une erreur.
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import {SUPABASE_URL, SUPABASE_ANON_KEY} from './config.js';
import {decalerMois} from './calc.js';

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

// ── Données du mois ────────────────────────────────────────────────────

export async function chargerMois(foyerId, cle) {
  const [mois, depenses, versements] = await Promise.all([
    sb.from('mois').select('id, cle').eq('foyer_id', foyerId).eq('cle', cle).maybeSingle(),
    sb.from('depenses').select('id, date, montant, categorie_id, membre_id, libelle')
      .eq('foyer_id', foyerId).gte('date', `${cle}-01`).lt('date', `${decalerMois(cle, 1)}-01`)
      .order('date', {ascending: false}).order('cree_le', {ascending: false}),
    sb.from('versements').select('id, objectif_id, mois_cle, montant, membre_id')
      .eq('foyer_id', foyerId).eq('mois_cle', cle).order('cree_le'),
  ]);
  const donnees = {
    mois: verifier(mois, 'Impossible de charger le mois.'),
    membresMois: [],
    revenus: [],
    recurrentes: [],
    budgets: [],
    depenses: verifier(depenses, 'Impossible de charger les dépenses.'),
    versements: verifier(versements, 'Impossible de charger les versements.'),
  };
  if (!donnees.mois) return donnees;

  const id = donnees.mois.id;
  const [membresMois, revenus, recurrentes, budgets] = await Promise.all([
    sb.from('mois_membres').select('membre_id, salaire, solde').eq('mois_id', id),
    sb.from('revenus_mois').select('id, libelle, montant').eq('mois_id', id).order('libelle'),
    sb.from('recurrentes_mois').select('id, recurrente_id, libelle, icone, montant, ordre').eq('mois_id', id)
      .order('ordre').order('libelle'),
    sb.from('budgets_mois').select('categorie_id, montant').eq('mois_id', id),
  ]);
  donnees.membresMois = verifier(membresMois, 'Impossible de charger les salaires.');
  donnees.revenus = verifier(revenus, 'Impossible de charger les revenus.');
  donnees.recurrentes = verifier(recurrentes, 'Impossible de charger les charges fixes.');
  donnees.budgets = verifier(budgets, 'Impossible de charger les budgets.');
  return donnees;
}

// Clés des mois ouverts, du plus récent au plus ancien
export async function listerMois(foyerId) {
  const lignes = verifier(await sb.from('mois').select('cle').eq('foyer_id', foyerId).order('cle', {ascending: false}),
    'Impossible de lister les mois.');
  return lignes.map((l) => l.cle);
}

// Actives et inactives (les dépenses passées gardent leur catégorie)
export async function chargerCategories(foyerId) {
  return verifier(await sb.from('categories').select('*').eq('foyer_id', foyerId).order('ordre').order('nom'),
    'Impossible de charger les catégories.');
}

export async function chargerObjectifs(foyerId) {
  const [objectifs, versements] = await Promise.all([
    sb.from('objectifs').select('*').eq('foyer_id', foyerId).order('cree_le'),
    sb.from('versements').select('id, objectif_id, mois_cle, montant, membre_id, cree_le')
      .eq('foyer_id', foyerId).order('mois_cle').order('cree_le'),
  ]);
  return {
    objectifs: verifier(objectifs, 'Impossible de charger les objectifs.'),
    versements: verifier(versements, 'Impossible de charger les versements.'),
  };
}

// ── Temps réel ─────────────────────────────────────────────────────────

const TABLES_TEMPS_REEL = ['depenses', 'versements', 'mois', 'budgets_mois', 'recurrentes_mois'];

export function ecouter(foyerId, cb) {
  const canal = sb.channel(`foyer-${foyerId}`);
  for (const table of TABLES_TEMPS_REEL) {
    canal.on('postgres_changes', {event: '*', schema: 'public', table, filter: `foyer_id=eq.${foyerId}`}, cb);
    // Les suppressions ne sont pas filtrables côté Realtime : on les écoute à part
    canal.on('postgres_changes', {event: 'DELETE', schema: 'public', table}, cb);
  }
  canal.subscribe();
  return () => sb.removeChannel(canal);
}

// ── Ouverture du mois ──────────────────────────────────────────────────

// membres: [{membre_id, salaire, solde}], revenus: [{libelle, montant}], versements: [{objectif_id, montant, membre_id}]
// Si le mois existe déjà (ouvert par l'autre membre), renvoie son id sans rien modifier.
export async function ouvrirMois(cle, membres, revenus, versements) {
  return verifierRpc(await sb.rpc('ouvrir_mois', {
    p_cle: cle, p_membres: membres, p_revenus: revenus, p_versements: versements,
  }), 'Ouverture du mois impossible.');
}
