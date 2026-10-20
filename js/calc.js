// Fonctions pures de calcul : mois, montants, synthèse du budget, objectifs.
// Aucune dépendance au DOM ni à Supabase (testées avec node --test).

const arrondi = (x) => Math.round(x * 100) / 100;
const somme = (liste) => arrondi(liste.reduce((t, x) => t + (Number(x) || 0), 0));

// ── Montants ───────────────────────────────────────────────────────────

export function parseMontant(saisie, {negatif = false} = {}) {
  if (typeof saisie === 'number') {
    if (!Number.isFinite(saisie) || (saisie < 0 && !negatif)) return null;
    return arrondi(saisie);
  }
  const texte = String(saisie ?? '').replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(texte)) return null;
  const n = arrondi(Number(texte));
  if (n < 0 && !negatif) return null;
  return n === 0 ? 0 : n;   // pas de -0
}

const formateur = new Intl.NumberFormat('fr-FR', {style: 'currency', currency: 'EUR'});

export function formatEUR(n, {signe = false} = {}) {
  const texte = formateur.format(n).replace(/[  ]/g, ' ');
  return signe && n > 0 ? '+' + texte : texte;
}

// ── Mois (clés 'YYYY-MM') ───────────────────────────────────────────────

const versIndex = (cle) => {
  const [a, m] = cle.split('-').map(Number);
  return a * 12 + (m - 1);
};
const depuisIndex = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

export function cleMois(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function decalerMois(cle, n) {
  return depuisIndex(versIndex(cle) + n);
}

export function nbMois(debut, fin) {
  return Math.max(0, versIndex(fin) - versIndex(debut) + 1);
}

const formateurMois = new Intl.DateTimeFormat('fr-FR', {month: 'long', year: 'numeric'});

export function libelleMois(cle) {
  const [a, m] = cle.split('-').map(Number);
  return formateurMois.format(new Date(a, m - 1, 1));
}

// ── Budget ──────────────────────────────────────────────────────────────

export function niveauBudget(budget, depense) {
  if (budget <= 0) return depense > 0 ? 'depasse' : 'vide';
  if (depense > budget) return 'depasse';
  if (arrondi(depense * 100) >= arrondi(budget * 80)) return 'alerte';
  return 'ok';
}

// Le solde saisi est le point de départ : on n'ajoute ou ne retire que ce qui n'y était pas encore.
// membres    : [{membre_id, salaire, solde, solde_le, salaire_dans_solde}]
// revenus    : [{montant, dans_solde}]        recurrentes : [{montant, dans_solde}]
// budgets    : [{categorie_id, montant}]      depenses    : [{categorie_id, membre_id, montant, date}]
// versements : [{montant}]
// Une dépense est déjà déduite si son payeur a saisi un solde et qu'elle date d'avant ce solde.
// Sans aucun solde saisi, les cases « déjà passé sur le compte » des revenus et charges sont ignorées.
export function syntheseMois({membres = [], revenus = [], recurrentes = [], budgets = [], depenses = [], versements = []}) {
  const avecSolde = membres.some((m) => m.solde != null);
  const comptes = somme(membres.map((m) => m.solde));

  const salaireAVenir = (m) => (m.salaire_dans_solde && m.solde != null ? 0 : Number(m.salaire) || 0);
  const salaires = somme(membres.map((m) => m.salaire));
  const salairesARecevoir = somme(membres.map(salaireAVenir));
  const autresRevenus = somme(revenus.map((r) => r.montant));
  const revenusARecevoir = somme(revenus.filter((r) => !(avecSolde && r.dans_solde)).map((r) => r.montant));

  const chargesFixes = somme(recurrentes.map((r) => r.montant));
  const chargesAPrelever = somme(recurrentes.filter((r) => !(avecSolde && r.dans_solde)).map((r) => r.montant));

  // Par catégorie : on prévoit le plus grand du budget et du dépensé, moins ce qui est déjà sorti du compte
  const dateSolde = new Map(membres.filter((m) => m.solde != null && m.solde_le).map((m) => [m.membre_id, m.solde_le]));
  const dejaDeduite = (d) => dateSolde.has(d.membre_id) && d.date < dateSolde.get(d.membre_id);
  const parCategorie = new Map();
  const ligne = (id) => parCategorie.get(id) ?? parCategorie.set(id, {budget: 0, depense: 0, deduit: 0}).get(id);
  for (const b of budgets) ligne(b.categorie_id).budget += Number(b.montant) || 0;
  for (const d of depenses) {
    const l = ligne(d.categorie_id);
    l.depense += Number(d.montant) || 0;
    if (dejaDeduite(d)) l.deduit += Number(d.montant) || 0;
  }
  const lignes = [...parCategorie.values()];
  const budgetsTotal = somme(budgets.map((b) => b.montant));
  const budgetsPrevus = somme(lignes.map((l) => Math.max(l.budget, l.depense)));
  const depensesDeduites = somme(lignes.map((l) => l.deduit));
  const budgetsAVenir = arrondi(budgetsPrevus - depensesDeduites);

  const objectifs = somme(versements.map((v) => v.montant));
  const disponible = arrondi(comptes + salairesARecevoir + revenusARecevoir);
  const resteLibre = arrondi(disponible - chargesAPrelever - budgetsAVenir - objectifs);
  return {
    comptes, salaires, salairesARecevoir, autresRevenus, revenusARecevoir, disponible,
    chargesFixes, chargesAPrelever,
    budgets: budgetsTotal, budgetsPrevus, depensesDeduites, budgetsAVenir,
    objectifs, resteLibre,
    pctResteLibre: disponible > 0 ? arrondi((resteLibre / disponible) * 100) : null,
  };
}

// Bilan d'un mois terminé : budgets prévus, dépensé, catégories dépassées (de la plus dépassée à la moins)
export function bilanMois({budgets = [], depenses = []}) {
  const parCategorie = new Map();
  const ligne = (id) => parCategorie.get(id) ?? parCategorie.set(id, {categorie_id: id, budget: 0, depense: 0}).get(id);
  for (const b of budgets) ligne(b.categorie_id).budget += Number(b.montant) || 0;
  for (const d of depenses) ligne(d.categorie_id).depense += Number(d.montant) || 0;
  const lignes = [...parCategorie.values()].map((l) => ({...l, budget: arrondi(l.budget), depense: arrondi(l.depense)}));
  const prevu = somme(lignes.map((l) => l.budget));
  const depense = somme(lignes.map((l) => l.depense));
  const depassements = lignes.filter((l) => l.depense > l.budget)
    .map((l) => ({...l, ecart: arrondi(l.depense - l.budget)}))
    .sort((x, y) => y.ecart - x.ecart);
  return {prevu, depense, ecart: arrondi(prevu - depense), depassements};
}

export function depensesParCategorie(depenses) {
  const parCategorie = new Map();
  for (const d of depenses) {
    const ligne = parCategorie.get(d.categorie_id) ?? {total: 0, parMembre: {}};
    ligne.total = arrondi(ligne.total + Number(d.montant));
    ligne.parMembre[d.membre_id] = arrondi((ligne.parMembre[d.membre_id] ?? 0) + Number(d.montant));
    parCategorie.set(d.categorie_id, ligne);
  }
  return parCategorie;
}

export function totalParMembre(depenses) {
  const totaux = {};
  for (const d of depenses) totaux[d.membre_id] = arrondi((totaux[d.membre_id] ?? 0) + Number(d.montant));
  return totaux;
}

export function topPostes(postes, n = 5) {
  const tries = postes.filter((p) => p.montant > 0).sort((a, b) => b.montant - a.montant);
  if (tries.length <= n + 1) return tries;
  return [...tries.slice(0, n), {nom: 'Autres', montant: somme(tries.slice(n).map((p) => p.montant))}];
}

// ── Objectifs ───────────────────────────────────────────────────────────

export function effortMensuel(cible, debut, fin) {
  const n = nbMois(debut, fin);
  return n ? arrondi(cible / n) : 0;
}

export function cibleDepuisMensuel(mensuel, nbMoisTotal) {
  return arrondi(mensuel * nbMoisTotal);
}

export function suiviObjectif({cible, debut, fin}, versements, moisCourant) {
  const verse = somme(versements.map((v) => v.montant));
  const effort = effortMensuel(cible, debut, fin);
  // Le mois en cours n'est dû qu'une fois un versement fait ce mois-ci : un objectif tout juste créé est « à jour »
  const verseCeMois = versements.some((v) => v.mois_cle === moisCourant);
  const moisEcoules = Math.max(0, Math.min(nbMois(debut, fin), nbMois(debut, moisCourant) - (verseCeMois ? 0 : 1)));
  const prevu = Math.min(cible, arrondi(effort * moisEcoules));

  let statut;
  if (verse >= cible) statut = 'atteint';
  else if (Math.abs(verse - prevu) < 1) statut = 'ajour';
  else if (verse > prevu) statut = 'avance';
  else statut = 'retard';

  const echu = moisCourant > fin;
  let moisRestants = 0;
  if (!echu) {
    let depart = debut > moisCourant ? debut : moisCourant;
    if (depart === moisCourant && versements.some((v) => v.mois_cle === moisCourant)) {
      depart = decalerMois(depart, 1);
    }
    moisRestants = nbMois(depart, fin);
  }
  const effortRecalcule = moisRestants ? arrondi(Math.max(0, cible - verse) / moisRestants) : 0;

  return {verse, pct: arrondi((verse / cible) * 100), prevu, statut, moisRestants, effortRecalcule, echu};
}
