// Accès aux données : client Supabase et toutes les requêtes de l'app.
// Chaque fonction lève une Error au message en français si Supabase renvoie une erreur.
import {SUPABASE_URL, SUPABASE_ANON_KEY} from './config.js';
import {decalerMois} from './calc.js';

// supabase-js est chargé par index.html (js/vendor/supabase.js), servi par le site lui-même
export const sb = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
  if (code === 'signup_disabled' || /signups not allowed/i.test(texte)) return 'Les inscriptions sont fermées pour ce budget';
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

// Envoie le lien de réinitialisation ; au retour, surAuth reçoit 'PASSWORD_RECOVERY'
export async function demanderReinitialisation(email) {
  const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname});
  if (error) throw new Error(messageAuth(error));
}

export async function changerMotDePasse(mdp) {
  const {error} = await sb.auth.updateUser({password: mdp});
  if (error) throw new Error(messageAuth(error));
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
  foyer_complet: 'Ce foyer a déjà deux membres',
  trop_d_essais: 'Trop de codes erronés : réessaie dans une heure',
  pas_soi_meme: 'Tu ne peux pas te retirer toi-même',
  membre_inconnu: 'Ce membre ne fait plus partie du foyer',
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
  const tous = verifier(membres, 'Impossible de charger les membres.');
  return {
    foyer: verifier(foyer, 'Impossible de charger le foyer.'),
    membres: tous.filter((m) => m.user_id),
    anciensMembres: tous.filter((m) => !m.user_id),   // retirés du foyer : leurs dépenses passées gardent leur prénom
    moi,
  };
}

export async function creerFoyer(prenom) {
  return verifierRpc(await sb.rpc('creer_foyer', {p_prenom: prenom}), 'Création du foyer impossible.');
}

export async function rejoindreFoyer(code, prenom) {
  const foyerId = verifierRpc(await sb.rpc('rejoindre_foyer', {p_code: code, p_prenom: prenom}), 'Impossible de rejoindre le foyer.');
  if (!foyerId) throw new Error(MESSAGES_RPC.code_invalide);
  return foyerId;
}

// Nouveau code d'invitation : l'ancien ne permet plus de rejoindre le foyer
export async function regenererCode() {
  return verifierRpc(await sb.rpc('regenerer_code'), 'Impossible de changer le code.');
}

// Coupe l'accès d'un autre membre (ses dépenses passées restent) ; renvoie le nouveau code
export async function retirerMembre(membreId) {
  return verifierRpc(await sb.rpc('retirer_membre', {p_membre: membreId}), 'Impossible de retirer ce membre.');
}

// ── Données du mois ────────────────────────────────────────────────────

export async function chargerMois(foyerId, cle) {
  const [mois, depenses, versements] = await Promise.all([
    sb.from('mois').select('id, cle').eq('foyer_id', foyerId).eq('cle', cle).maybeSingle(),
    sb.from('depenses').select('id, date, montant, categorie_id, membre_id, libelle, cree_le')
      .eq('foyer_id', foyerId).gte('date', `${cle}-01`).lt('date', `${decalerMois(cle, 1)}-01`)
      .order('date', {ascending: false}).order('cree_le', {ascending: false}),
    sb.from('versements').select('id, objectif_id, mois_cle, montant, membre_id, dans_solde')
      .eq('foyer_id', foyerId).eq('mois_cle', cle).order('cree_le'),
  ]);
  const donnees = {
    mois: verifier(mois, 'Impossible de charger le mois.'),
    membresMois: [],
    revenus: [],
    recurrentes: [],
    budgets: [],
    depenses: verifier(depenses, 'Impossible de charger les dépenses.'),
    depensesAvant: [],
    versements: verifier(versements, 'Impossible de charger les versements.'),
  };
  if (!donnees.mois) return donnees;

  const id = donnees.mois.id;
  const [membresMois, revenus, recurrentes, budgets] = await Promise.all([
    sb.from('mois_membres')
      .select('membre_id, salaire, solde, solde_le, solde_a, salaire_dans_solde, salaire_recu, renseigne').eq('mois_id', id),
    sb.from('revenus_mois').select('id, libelle, montant, dans_solde, membre_id').eq('mois_id', id).order('libelle'),
    sb.from('recurrentes_mois')
      .select('id, recurrente_id, libelle, icone, montant, ordre, dans_solde, variable, a_confirmer, membre_id').eq('mois_id', id)
      .order('ordre').order('libelle'),
    sb.from('budgets_mois').select('categorie_id, montant').eq('mois_id', id),
  ]);
  donnees.membresMois = verifier(membresMois, 'Impossible de charger les salaires.');
  donnees.revenus = verifier(revenus, 'Impossible de charger les revenus.');
  donnees.recurrentes = verifier(recurrentes, 'Impossible de charger les charges fixes.');
  donnees.budgets = verifier(budgets, 'Impossible de charger les budgets.');

  // Mois ouvert en avance : les dépenses faites entre le solde et le 1er du mois sont aussi sorties du compte
  const debut = donnees.membresMois.map((m) => m.solde_le).filter((d) => d && d < `${cle}-01`).sort()[0];
  if (debut) {
    donnees.depensesAvant = verifier(await sb.from('depenses').select('id, date, montant, categorie_id, membre_id, cree_le')
      .eq('foyer_id', foyerId).gte('date', debut).lt('date', `${cle}-01`), 'Impossible de charger les dépenses.');
  }
  return donnees;
}

// Toutes les lignes d'une requête, par pages de 1000 (limite de Supabase par réponse).
// Une ligne ajoutée entre deux pages peut décaler la suivante : les doublons sont écartés par clé,
// et le rechargement déclenché par le temps réel rattrape une ligne sautée.
async function toutesLesLignes(requete, message, cle = (l) => l.id) {
  const page = 1000;
  const lignes = new Map();
  for (let debut = 0; ; debut += page) {
    const lot = verifier(await requete().range(debut, debut + page - 1), message);
    for (const l of lot) lignes.set(cle(l), l);
    if (lot.length < page) return [...lignes.values()];
  }
}

// Rapports : mois ouverts de debut à fin, plus le dernier mois ouvert avant debut (référence du « pourquoi »).
// Une requête par table pour toute la plage. Renvoie {parMois: {cle: {cle, mois, membresMois, revenus,
// recurrentes, depenses, versements}}, reference: cle | null} ; seuls les mois ouverts y figurent.
export async function chargerPlage(foyerId, debut, fin) {
  const tous = verifier(await sb.from('mois').select('id, cle').eq('foyer_id', foyerId).lte('cle', fin)
    .order('cle', {ascending: false}), 'Impossible de charger les mois du rapport.');
  const reference = tous.find((m) => m.cle < debut) ?? null;
  const retenus = tous.filter((m) => m.cle >= debut || m === reference);
  if (!retenus.length) return {parMois: {}, reference: null};

  const ids = retenus.map((m) => m.id);
  const premier = retenus.at(-1).cle;
  const message = 'Impossible de charger les données du rapport.';
  const [membresMois, revenus, recurrentes, depenses, versements] = await Promise.all([
    toutesLesLignes(() => sb.from('mois_membres').select('mois_id, membre_id, salaire').in('mois_id', ids)
      .order('mois_id').order('membre_id'), message, (l) => `${l.mois_id}:${l.membre_id}`),
    toutesLesLignes(() => sb.from('revenus_mois').select('id, mois_id, libelle, montant').in('mois_id', ids).order('id'), message),
    toutesLesLignes(() => sb.from('recurrentes_mois')
      .select('id, mois_id, recurrente_id, libelle, icone, montant, variable, a_confirmer, membre_id').in('mois_id', ids)
      .order('id'), message),
    toutesLesLignes(() => sb.from('depenses').select('id, date, montant, categorie_id, membre_id')
      .eq('foyer_id', foyerId).gte('date', `${premier}-01`).lt('date', `${decalerMois(fin, 1)}-01`).order('id'), message),
    toutesLesLignes(() => sb.from('versements').select('id, objectif_id, mois_cle, montant')
      .eq('foyer_id', foyerId).gte('mois_cle', premier).lte('mois_cle', fin).order('id'), message),
  ]);

  const parMois = {};
  const cleDe = new Map(retenus.map((m) => [m.id, m.cle]));
  for (const m of retenus) {
    parMois[m.cle] = {cle: m.cle, mois: m, membresMois: [], revenus: [], recurrentes: [], depenses: [], versements: []};
  }
  const ranger = (lignes, champ, cle) => {
    for (const l of lignes) parMois[cle(l)]?.[champ].push(l);
  };
  ranger(membresMois, 'membresMois', (l) => cleDe.get(l.mois_id));
  ranger(revenus, 'revenus', (l) => cleDe.get(l.mois_id));
  ranger(recurrentes, 'recurrentes', (l) => cleDe.get(l.mois_id));
  ranger(depenses, 'depenses', (l) => l.date.slice(0, 7));     // dépenses d'un mois non ouvert : ignorées
  ranger(versements, 'versements', (l) => l.mois_cle);
  return {parMois, reference: reference?.cle ?? null};
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

const TABLES_TEMPS_REEL = [
  'depenses', 'versements', 'mois', 'budgets_mois', 'recurrentes_mois',
  'objectifs', 'categories', 'recurrentes', 'revenus_mois', 'mois_membres', 'membres',
];

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

// membres: [{membre_id, salaire, solde, salaire_dans_solde}] (sa propre part), revenus: [{libelle, montant, dans_solde}],
// versements: [{objectif_id, montant, membre_id}], prelevees: ids des récurrentes du modèle déjà prélevées.
// Renvoie {mois_id, cree} : si l'autre membre a déjà ouvert le mois, seule la part de l'appelant y est ajoutée.
export async function ouvrirMois(cle, membres, revenus, versements, prelevees) {
  return verifierRpc(await sb.rpc('ouvrir_mois', {
    p_cle: cle, p_membres: membres, p_revenus: revenus, p_versements: versements, p_prelevees: prelevees,
  }), 'Ouverture du mois impossible.');
}

// Charges fixes actives du modèle (proposées à l'ouverture)
export async function chargerRecurrentesModele(foyerId) {
  return verifier(await sb.from('recurrentes').select('id, libelle, icone, montant, variable, membre_id')
    .eq('foyer_id', foyerId).eq('active', true).order('ordre').order('libelle'),
  'Impossible de charger les charges fixes.');
}

// ── Charges fixes (récurrentes) ────────────────────────────────────────
// Chaque modification touche la ligne du mois et le modèle utilisé pour les mois suivants.

// membre_id : charge personnelle de ce membre (null = commune) ; variable : montant à confirmer chaque mois.
// modele = false (mois passé) : la charge n'est ajoutée qu'à ce mois-là.
export async function ajouterRecurrente(foyerId, moisId,
  {libelle, icone, montant, ordre = 99, dans_solde = false, variable = false, membre_id = null}, {modele: avecModele = true} = {}) {
  if (!avecModele) {
    verifier(await sb.from('recurrentes_mois').insert({foyer_id: foyerId, mois_id: moisId, recurrente_id: null,
      libelle, icone, montant, ordre, dans_solde, variable, membre_id}), 'Impossible d\'ajouter la charge.');
    return;
  }
  const modele = verifier(await sb.from('recurrentes')
    .insert({foyer_id: foyerId, libelle, icone, montant, ordre, variable, membre_id}).select('id').single(),
  'Impossible d\'ajouter la charge.');
  verifier(await sb.from('recurrentes_mois').insert({foyer_id: foyerId, mois_id: moisId, recurrente_id: modele.id,
    libelle, icone, montant, ordre, dans_solde, variable, membre_id}),
  'Charge ajoutée au modèle, mais pas à ce mois-ci.');
}

// Le mois reçoit tout ; le modèle garde libellé, icône, montant (proposé le mois suivant), variable et payeur.
// dans_solde ne concerne que ce mois. Enregistrer un montant le confirme (a_confirmer : pour annuler une revue).
// modele = false (mois passé) : le modèle n'est pas touché.
export async function modifierRecurrente(ligneMois, {libelle, icone, montant, variable, membre_id, dans_solde, a_confirmer = false},
  {modele = true} = {}) {
  verifier(await sb.from('recurrentes_mois')
    .update({libelle, icone, montant, variable, membre_id, dans_solde, a_confirmer}).eq('id', ligneMois.id),
  'Impossible de modifier la charge.');
  if (modele && ligneMois.recurrente_id) {
    verifier(await sb.from('recurrentes').update({libelle, icone, montant, variable, membre_id}).eq('id', ligneMois.recurrente_id),
      'Charge modifiée pour ce mois, mais pas pour les mois suivants.');
  }
}

// Montant réel d'une charge variable pour ce mois (et proposé le mois suivant)
export async function confirmerMontant(ligneMois, montant, {modele = true} = {}) {
  verifier(await sb.from('recurrentes_mois').update({montant, a_confirmer: false}).eq('id', ligneMois.id),
    'Impossible d\'enregistrer le montant.');
  if (modele && ligneMois.recurrente_id) {
    verifier(await sb.from('recurrentes').update({montant}).eq('id', ligneMois.recurrente_id),
      'Montant enregistré pour ce mois, mais pas proposé le mois prochain.');
  }
}

// Retire la charge du mois seulement : le modèle reste actif pour les mois suivants
export async function retirerDuMois(ligneMoisId) {
  verifier(await sb.from('recurrentes_mois').delete().eq('id', ligneMoisId), 'Impossible de retirer la charge.');
}

// Annule un retrait : remet la ligne telle qu'elle était
export async function restaurerDansMois(foyerId, moisId, ligne) {
  const {id, recurrente_id, libelle, icone, montant, ordre, dans_solde = false, variable = false, a_confirmer = false,
    membre_id = null} = ligne;
  verifier(await sb.from('recurrentes_mois').insert({id, foyer_id: foyerId, mois_id: moisId, recurrente_id, libelle, icone,
    montant, ordre, dans_solde, variable, a_confirmer, membre_id}),
  'Impossible de restaurer la charge.');
}

// Supprime du mois et désactive dans le modèle
export async function supprimerRecurrente(ligneMois) {
  await retirerDuMois(ligneMois.id);
  if (ligneMois.recurrente_id) {
    verifier(await sb.from('recurrentes').update({active: false}).eq('id', ligneMois.recurrente_id),
      'Charge retirée de ce mois, mais toujours prévue les mois suivants.');
  }
}

// ── Autres revenus du mois ─────────────────────────────────────────────

// membre_id : revenu perso (prime…) ; null = commun (CAF…)
export async function ajouterRevenu(foyerId, moisId, {libelle, montant, dans_solde, membre_id = null}) {
  verifier(await sb.from('revenus_mois').insert({foyer_id: foyerId, mois_id: moisId, libelle, montant, dans_solde, membre_id}),
    "Impossible d'ajouter le revenu.");
}

export async function modifierRevenu(id, {libelle, montant, dans_solde, membre_id = null}) {
  verifier(await sb.from('revenus_mois').update({libelle, montant, dans_solde, membre_id}).eq('id', id),
    'Impossible de modifier le revenu.');
}

export async function supprimerRevenu(id) {
  verifier(await sb.from('revenus_mois').delete().eq('id', id), 'Impossible de supprimer le revenu.');
}

// ── Dépenses ponctuelles ───────────────────────────────────────────────

export async function ajouterDepense(foyerId, {date, montant, categorie_id, membre_id, libelle}) {
  verifier(await sb.from('depenses').insert({foyer_id: foyerId, date, montant, categorie_id, membre_id, libelle: libelle || null}),
    'Impossible d\'enregistrer la dépense.');
}

export async function modifierDepense(id, champs) {
  verifier(await sb.from('depenses').update({...champs, libelle: champs.libelle || null}).eq('id', id),
    'Impossible de modifier la dépense.');
}

export async function supprimerDepense(id) {
  verifier(await sb.from('depenses').delete().eq('id', id), 'Impossible de supprimer la dépense.');
}

// ── Budgets par catégorie ──────────────────────────────────────────────

// Budget du mois et budget par défaut des mois suivants (modele = false pour un mois passé : ce mois seulement)
export async function modifierBudget(foyerId, moisId, categorieId, montant, {modele = true} = {}) {
  verifier(await sb.from('budgets_mois')
    .upsert({foyer_id: foyerId, mois_id: moisId, categorie_id: categorieId, montant}, {onConflict: 'mois_id,categorie_id'}),
  'Impossible de modifier le budget.');
  if (!modele) return;
  verifier(await sb.from('categories').update({budget_defaut: montant}).eq('id', categorieId),
    'Budget modifié pour ce mois, mais pas pour les mois suivants.');
}

// ── Catégories ─────────────────────────────────────────────────────────
// Jamais supprimées : une catégorie désactivée garde ses dépenses passées.

// moisId : mois en cours (ouvert), qui reçoit aussi le budget de la nouvelle catégorie
export async function creerCategorie(foyerId, moisId, {nom, icone, budget, ordre}) {
  const cat = verifier(await sb.from('categories')
    .insert({foyer_id: foyerId, nom, icone, budget_defaut: budget, ordre}).select('id').single(),
  'Impossible de créer la catégorie.');
  if (moisId) {
    verifier(await sb.from('budgets_mois').insert({foyer_id: foyerId, mois_id: moisId, categorie_id: cat.id, montant: budget}),
      'Catégorie créée, mais pas ajoutée au budget de ce mois.');
  }
}

export async function modifierCategorie(id, {nom, icone}) {
  verifier(await sb.from('categories').update({nom, icone}).eq('id', id), 'Impossible de modifier la catégorie.');
}

// Désactiver la retire du budget du mois en cours ; la réactiver l'y remet avec son budget par défaut
export async function activerCategorie(foyerId, moisId, categorie, active) {
  verifier(await sb.from('categories').update({active}).eq('id', categorie.id), 'Impossible de modifier la catégorie.');
  if (!moisId) return;
  const requete = active
    ? sb.from('budgets_mois').upsert({foyer_id: foyerId, mois_id: moisId, categorie_id: categorie.id,
        montant: categorie.budget_defaut}, {onConflict: 'mois_id,categorie_id'})
    : sb.from('budgets_mois').delete().eq('mois_id', moisId).eq('categorie_id', categorie.id);
  verifier(await requete, 'Catégorie modifiée, mais pas le budget de ce mois.');
}

// ── Profil ─────────────────────────────────────────────────────────────

// paie_mois_precedent : le salaire du mois M arrive fin M-1 (la réponse d'ouverture est alors préremplie)
export async function modifierProfil(membreId, {prenom, salaire_defaut, paie_mois_precedent}) {
  verifier(await sb.from('membres').update({prenom, salaire_defaut, paie_mois_precedent}).eq('id', membreId),
    "Impossible d'enregistrer ton profil.");
}

// ── Objectifs d'épargne ────────────────────────────────────────────────

export async function creerObjectif(foyerId, {nom, icone, cible, debut, fin}) {
  verifier(await sb.from('objectifs').insert({foyer_id: foyerId, nom, icone, cible, debut, fin}),
    'Impossible de créer l\'objectif.');
}

export async function modifierObjectif(id, champs) {
  verifier(await sb.from('objectifs').update(champs).eq('id', id), 'Impossible de modifier l\'objectif.');
}

export async function archiverObjectif(id) {
  await modifierObjectif(id, {archive: true});
}

// Un retrait est un versement négatif ; membre_id null = commun ; dans_solde : déjà parti quand le solde a été saisi
export async function ajouterVersement(foyerId, {objectif_id, mois_cle, montant, membre_id, dans_solde = false}) {
  verifier(await sb.from('versements').insert({foyer_id: foyerId, objectif_id, mois_cle, montant, membre_id, dans_solde}),
    'Impossible d\'enregistrer le versement.');
}

export async function supprimerVersement(id) {
  verifier(await sb.from('versements').delete().eq('id', id), 'Impossible de supprimer le versement.');
}

// ── Salaire et solde d'un membre pour un mois ──────────────────────────

// Crée la ligne si le membre a rejoint le foyer après l'ouverture du mois.
// Seuls les champs fournis sont modifiés (confirmer un salaire ne touche ni au solde ni à salaire_dans_solde).
export async function modifierMoisMembre(foyerId, moisId, membreId, champs) {
  const permis = ['salaire', 'solde', 'solde_le', 'solde_a', 'salaire_dans_solde', 'salaire_recu', 'renseigne'];
  const ligne = Object.fromEntries(Object.entries(champs).filter(([k, v]) => permis.includes(k) && v !== undefined));
  verifier(await sb.from('mois_membres')
    .upsert({foyer_id: foyerId, mois_id: moisId, membre_id: membreId, ...ligne}, {onConflict: 'mois_id,membre_id'}),
  'Impossible d\'enregistrer le salaire.');
}
