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
const formateurEntier = new Intl.NumberFormat('fr-FR', {style: 'currency', currency: 'EUR',
  minimumFractionDigits: 0, maximumFractionDigits: 0});   // minimum explicite : sinon RangeError avant ES2023 (anciens iPhone)

// entier : arrondi à l'euro (textes des rapports : « Courses +120 € »)
export function formatEUR(n, {signe = false, entier = false} = {}) {
  const texte = (entier ? formateurEntier : formateur).format(n).replace(/[  ]/g, ' ');
  return signe && n > 0 ? '+' + texte : texte;
}

// « de Dylan », « d'Amel »
export const de = (prenom) => (/^[aeiouyàâéèêëîïôöûüh]/i.test(prenom) ? `d'${prenom}` : `de ${prenom}`);

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

// La paye du mois suivant arrive souvent avant le 1er : à partir de ce jour, on peut ouvrir ce mois en avance
export const JOUR_OUVERTURE_ANTICIPEE = 20;

export function peutOuvrirEnAvance(date = new Date()) {
  return date.getDate() >= JOUR_OUVERTURE_ANTICIPEE;
}

// Mois en cours pour l'app : le dernier mois ouvert. Un mois commence quand on l'ouvre (saisie du solde, paye reçue),
// pas le 1er : tant que le suivant n'est pas ouvert, on reste sur l'ancien. Après plus d'un mois sans ouverture
// (ou au tout début), c'est le mois calendaire, à ouvrir.
export function moisActif(disponibles, date = new Date()) {
  const calendaire = cleMois(date);
  const dernier = disponibles.filter((c) => c <= decalerMois(calendaire, 1)).sort().at(-1);
  return dernier && dernier >= decalerMois(calendaire, -1) ? dernier : calendaire;
}

// Proposer d'ouvrir le mois suivant : dès le 20 du mois en cours, ou tout de suite s'il est déjà passé
export function proposerMoisSuivant(courant, date = new Date()) {
  const calendaire = cleMois(date);
  return courant < calendaire || (courant === calendaire && peutOuvrirEnAvance(date));
}

// Premier jour d'un mois ouvert : le plus ancien solde saisi pour ce mois, au plus tard le 1er
// parts : mois_membres du mois [{solde_le}]
export function debutMois(cle, parts = []) {
  return [`${cle}-01`, ...parts.map((p) => p.solde_le).filter(Boolean)].sort()[0];
}

// Période d'un mois ouvert, fin exclue : de son début au début du mois suivant s'il est ouvert ;
// sinon jusqu'au 1er du mois d'après (le mois suivant pas encore ouvert, ou sauté, lui revient).
// partsSuivant : mois_membres du mois suivant, null s'il n'est pas ouvert. Dates 'YYYY-MM-DD' ; close : suivant ouvert.
export function periodeMois(cle, parts = [], partsSuivant = null) {
  const suivant = decalerMois(cle, 1);
  return partsSuivant
    ? {debut: debutMois(cle, parts), fin: debutMois(suivant, partsSuivant), close: true}
    : {debut: debutMois(cle, parts), fin: `${decalerMois(suivant, 1)}-01`, close: false};
}

const formateurJour = new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'short'});
const jourEnClair = (iso, decalage = 0) => {
  const [a, m, j] = iso.split('-').map(Number);
  return formateurJour.format(new Date(a, m - 1, j + decalage));
};

// « depuis le 27 oct. » (mois en cours) ou « du 27 sept. au 26 oct. » ; null pour un mois calendaire du 1er au 1er
export function periodeEnClair(cle, periode) {
  if (!periode) return null;
  const calendaire = periode.debut === `${cle}-01` && (!periode.close || periode.fin === `${decalerMois(cle, 1)}-01`);
  if (calendaire) return null;
  return periode.close ? `du ${jourEnClair(periode.debut)} au ${jourEnClair(periode.fin, -1)}` : `depuis le ${jourEnClair(periode.debut)}`;
}

// Mois d'une dépense datée : le dernier mois ouvert commencé à cette date (null : avant le premier)
// periodes : [{cle, debut, fin}]
export function moisDeLaDate(date, periodes) {
  return periodes.find((p) => p.debut <= date && date < p.fin)?.cle ?? null;
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

// Statut d'une charge du mois : montant à saisir d'abord, puis déjà partie du compte, sinon encore à prélever
export function statutRecurrente(r) {
  if (r.a_confirmer) return 'a-confirmer';
  return r.dans_solde ? 'prelevee' : 'a-prelever';
}

// Total des charges du mois réparti par statut (montant et nombre de lignes)
export function etatRecurrentes(recurrentes) {
  const parStatut = {'prelevee': [], 'a-prelever': [], 'a-confirmer': []};
  for (const r of recurrentes) parStatut[statutRecurrente(r)].push(r.montant);
  const resume = (liste) => ({total: somme(liste), nb: liste.length});
  return {total: somme(recurrentes.map((r) => r.montant)), prelevees: resume(parStatut.prelevee),
    aPrelever: resume(parStatut['a-prelever']), aConfirmer: resume(parStatut['a-confirmer'])};
}

// Budgets du mois d'un coup d'œil : prévu, dépensé, niveau global et nombre de catégories par niveau
// lignes : [{budget, depense}] (une par catégorie suivie)
export function resumeBudgets(lignes) {
  const prevu = somme(lignes.map((l) => l.budget));
  const depense = somme(lignes.map((l) => l.depense));
  const compte = {ok: 0, alerte: 0, depasse: 0};
  for (const l of lignes) {
    const n = niveauBudget(l.budget, l.depense);
    if (n in compte) compte[n] += 1;
  }
  return {prevu, depense, reste: arrondi(prevu - depense), niveau: niveauBudget(prevu, depense), ...compte};
}

// Le solde saisi est le point de départ : on n'ajoute ou ne retire que ce qui n'y était pas encore.
// membres    : [{membre_id, salaire, solde, solde_le, solde_a, salaire_dans_solde}]
// revenus    : [{montant, dans_solde}]        recurrentes : [{montant, dans_solde}]
// budgets    : [{categorie_id, montant}]      depenses    : [{categorie_id, membre_id, montant, date, cree_le}]
// versements : [{montant, dans_solde}]
// Une dépense est déjà déduite si son payeur a saisi un solde et qu'elle date d'avant ce solde, ou du même jour
// et enregistrée avant lui (solde_a). Un mois commence au plus ancien solde saisi (periodeMois) : une dépense de l'autre
// faite entre ce solde et le sien compte dans le mois, mais est déjà dans son solde.
// Sans aucun solde saisi, les cases « déjà passé sur le compte » des revenus, charges et versements sont ignorées.
// Une dépense est déjà dans le solde de son payeur si elle date d'avant ce solde, ou du même jour et enregistrée avant lui
function deductions(membres) {
  const soldes = new Map(membres.filter((m) => m.solde != null && m.solde_le).map((m) => [m.membre_id, m]));
  const dejaDeduite = (d) => {
    const m = soldes.get(d.membre_id);
    if (!m) return false;
    if (d.date !== m.solde_le) return d.date < m.solde_le;
    return Boolean(m.solde_a && d.cree_le && new Date(d.cree_le) <= new Date(m.solde_a));
  };
  return {dejaDeduite};
}

export function syntheseMois({membres = [], revenus = [], recurrentes = [], budgets = [], depenses = [], versements = []}) {
  const avecSolde = membres.some((m) => m.solde != null);
  const {dejaDeduite} = deductions(membres);
  const comptes = arrondi(somme(membres.map((m) => m.solde)));

  const salaireAVenir = (m) => (m.salaire_dans_solde && m.solde != null ? 0 : Number(m.salaire) || 0);
  const salaires = somme(membres.map((m) => m.salaire));
  const salairesARecevoir = somme(membres.map(salaireAVenir));
  const autresRevenus = somme(revenus.map((r) => r.montant));
  const revenusARecevoir = somme(revenus.filter((r) => !(avecSolde && r.dans_solde)).map((r) => r.montant));

  const chargesFixes = somme(recurrentes.map((r) => r.montant));
  const chargesAPrelever = somme(recurrentes.filter((r) => !(avecSolde && r.dans_solde)).map((r) => r.montant));

  // Par catégorie : on prévoit le plus grand du budget et du dépensé, moins ce qui est déjà sorti du compte
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
  const objectifsAVenir = somme(versements.filter((v) => !(avecSolde && v.dans_solde)).map((v) => v.montant));
  const disponible = arrondi(comptes + salairesARecevoir + revenusARecevoir);
  const resteLibre = arrondi(disponible - chargesAPrelever - budgetsAVenir - objectifsAVenir);
  return {
    comptes, salaires, salairesARecevoir, autresRevenus, revenusARecevoir, disponible,
    chargesFixes, chargesAPrelever,
    budgets: budgetsTotal, budgetsPrevus, depensesDeduites, budgetsAVenir,
    objectifs, objectifsAVenir, resteLibre,
    pctResteLibre: disponible > 0 ? arrondi((resteLibre / disponible) * 100) : null,
  };
}

// Une colonne par membre : son solde, son salaire et ses revenus s'ils n'y sont pas encore, moins sa part de ce qui
// reste à sortir. Un revenu commun (CAF, membre_id null) est partagé comme les charges communes.
// Les charges communes passent par le compte joint : chacun y vire sa part (montant / nombre de membres).
// Charges perso et dépenses ne pèsent que sur leur payeur ; un versement commun (membre_id null) est partagé.
// Les budgets non encore dépensés restent au niveau du foyer : on ne sait pas encore qui paiera.
// membres : membresMois des membres actifs (même forme que syntheseMois) ; ids : identifiants des membres actifs.
export function colonnesMembres({membres = [], ids = [], revenus = [], recurrentes = [], depenses = [], versements = []}) {
  const avecSolde = membres.some((m) => m.solde != null);
  const {dejaDeduite} = deductions(membres);
  const parts = Math.max(1, ids.length);
  const aSortir = (x) => !(avecSolde && x.dans_solde);
  const commun = (x) => !ids.includes(x.membre_id);
  const communes = arrondi(somme(recurrentes.filter((r) => commun(r) && aSortir(r)).map((r) => r.montant)) / parts);
  const revenusCommuns = arrondi(somme(revenus.filter((r) => commun(r) && aSortir(r)).map((r) => r.montant)) / parts);
  const versementsCommuns = arrondi(somme(versements.filter((v) => commun(v) && aSortir(v)).map((v) => v.montant)) / parts);

  return ids.map((id) => {
    const m = membres.find((x) => x.membre_id === id);
    const siens = (liste) => liste.filter((x) => x.membre_id === id);
    const solde = m?.solde == null ? null : Number(m.solde);
    const salaireARecevoir = m && !(m.salaire_dans_solde && m.solde != null) ? Number(m.salaire) || 0 : 0;
    const revenusARecevoir = arrondi(somme(siens(revenus).filter(aSortir).map((r) => r.montant)) + revenusCommuns);
    const chargesPerso = somme(siens(recurrentes).filter(aSortir).map((r) => r.montant));
    const depensesPayees = somme(siens(depenses).filter((d) => !dejaDeduite(d)).map((d) => d.montant));
    const objectifs = arrondi(somme(siens(versements).filter(aSortir).map((v) => v.montant)) + versementsCommuns);
    const reste = arrondi((solde ?? 0) + salaireARecevoir + revenusARecevoir - communes - chargesPerso - depensesPayees - objectifs);
    return {membre_id: id, renseigne: Boolean(m?.renseigne), solde, salaireARecevoir, revenusARecevoir,
      communes, chargesPerso, depensesPayees, objectifs, reste};
  });
}

// Virement de chacun vers le compte commun ce mois-ci : (charges communes − revenus communs) / nombre de membres.
// Toutes les charges et revenus communs du mois comptent, déjà passés ou non : c'est le montant du mois.
export function virementCommun({ids = [], recurrentes = [], revenus = []}) {
  const commun = (x) => !ids.includes(x.membre_id);
  const charges = somme(recurrentes.filter(commun).map((r) => r.montant));
  const revenusCommuns = somme(revenus.filter(commun).map((r) => r.montant));
  const total = arrondi(charges - revenusCommuns);
  return {charges, revenus: revenusCommuns, total, parPersonne: arrondi(Math.max(0, total) / Math.max(1, ids.length))};
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

// ── Rapports ────────────────────────────────────────────────────────────
// Chiffres des rapports sur plusieurs mois. Ils reprennent syntheseMois et suiviObjectif
// pour ne jamais contredire les onglets Budget et Objectifs.

const sommeMontants = (liste) => somme(liste.map((x) => x.montant));
const moyenneDe = (valeurs) => {
  const connues = valeurs.filter((v) => v != null);
  return connues.length ? arrondi(connues.reduce((t, v) => t + v, 0) / connues.length) : null;
};
// Hausse notable : plus de 15 % au-dessus de la moyenne et plus de 20 € d'écart
const hausse = (v, moyenne) => v != null && moyenne != null && v > moyenne * 1.15 && v - moyenne > 20;
const serie = (valeurs) => {
  const moyenne = moyenneDe(valeurs);
  return {valeurs, moyenne, hausses: valeurs.map((v) => hausse(v, moyenne))};
};

// moisDonnees : [{cle, ouvert, depenses, recurrentes}] dans l'ordre de la période ; un mois non ouvert vaut null.
// Lignes : catégories actives et inactives ayant des dépenses sur la période, par ordre ; plus les charges fixes.
export function evolutionCategories(moisDonnees, categories) {
  const avecDepenses = new Set(moisDonnees.filter((m) => m.ouvert).flatMap((m) => m.depenses.map((d) => d.categorie_id)));
  const lignes = categories
    .filter((c) => c.active || avecDepenses.has(c.id))
    .sort((a, b) => a.ordre - b.ordre)
    .map((c) => ({categorie: c, ...serie(moisDonnees.map((m) =>
      (m.ouvert ? sommeMontants(m.depenses.filter((d) => d.categorie_id === c.id)) : null)))}));
  const chargesFixes = serie(moisDonnees.map((m) => (m.ouvert ? sommeMontants(m.recurrentes) : null)));
  return {lignes, chargesFixes};
}

// Entrées et sorties réelles du foyer pour un mois ouvert (une charge à confirmer compte pour son montant recopié)
export function entreesSorties({membresMois = [], revenus = [], recurrentes = [], depenses = []}) {
  const s = syntheseMois({membres: membresMois, revenus, recurrentes});
  const totalDepenses = sommeMontants(depenses);
  return {
    entrees: arrondi(s.salaires + s.autresRevenus),
    sorties: arrondi(s.chargesFixes + totalDepenses),
    salaires: s.salaires,
    revenus: s.autresRevenus,
    charges: s.chargesFixes,
    depenses: totalDepenses,
    estime: recurrentes.some((r) => r.a_confirmer),
  };
}

// Versé par mois (retraits inclus) et « prévu au départ » : effort initial des objectifs non archivés actifs ce mois-là
export function epargneParMois(versements, objectifs, cles) {
  const mois = cles.map((cle) => {
    const duMois = versements.filter((v) => v.mois_cle === cle);
    const parObjectif = {};
    for (const v of duMois) parObjectif[v.objectif_id] = arrondi((parObjectif[v.objectif_id] ?? 0) + Number(v.montant));
    const prevu = somme(objectifs
      .filter((o) => !o.archive && o.debut <= cle && cle <= o.fin)
      .map((o) => effortMensuel(Number(o.cible), o.debut, o.fin)));
    return {cle, verse: sommeMontants(duMois), parObjectif, prevu};
  });
  return {mois, totalVerse: somme(mois.map((m) => m.verse)), totalPrevu: somme(mois.map((m) => m.prevu))};
}

// cles : mois ouverts, croissants. baisse : % inférieur au mois ouvert précédent, les deux pendant l'objectif.
// Le mois en cours (enCours) n'est pas terminé : il n'est jamais jugé en baisse.
export function progressionObjectif(objectif, versements, cles, moisCourant = null) {
  const cible = Number(objectif.cible);
  const pendant = (cle) => objectif.debut <= cle && cle <= objectif.fin;
  const lignes = cles.map((cle) => {
    const verse = sommeMontants(versements.filter((v) => v.objectif_id === objectif.id && v.mois_cle === cle));
    return {cle, verse, pct: arrondi((verse / cible) * 100), baisse: false, enCours: cle === moisCourant};
  });
  lignes.forEach((l, i) => {
    const avant = lignes[i - 1];
    l.baisse = Boolean(avant) && !l.enCours && pendant(l.cle) && pendant(avant.cle) && l.pct < avant.pct;
  });
  return lignes;
}

const SEUIL_RAISON = 20;

// Ce qui a pesé sur le mois par rapport au précédent : jusqu'à 3 écarts défavorables d'au moins 20 €, du plus gros au plus petit.
// Une charge encore à confirmer, ce mois-ci ou le précédent, n'est jamais citée (son montant n'est qu'une estimation).
export function raisonsBaisse(courant, precedent, categories, membres) {
  const ecarts = [];
  const plus = (nom, ecart) => ecarts.push({texte: `${nom} ${formatEUR(ecart, {entier: true, signe: true})}`, ecart});
  const moins = (nom, ecart) => ecarts.push({texte: `${nom} −${formatEUR(ecart, {entier: true})}`, ecart});
  const totaux = (lignes, cle) => {
    const t = new Map();
    for (const l of lignes) t.set(cle(l), arrondi((t.get(cle(l)) ?? 0) + Number(l.montant)));
    return t;
  };

  const depAvant = totaux(precedent.depenses, (d) => d.categorie_id);
  for (const [id, montant] of totaux(courant.depenses, (d) => d.categorie_id)) {
    const nom = categories.find((c) => c.id === id)?.nom;
    if (nom) plus(nom, arrondi(montant - (depAvant.get(id) ?? 0)));
  }

  const cleCharge = (r) => r.recurrente_id ?? `libelle:${r.libelle}`;
  const chargesAvant = totaux(precedent.recurrentes, cleCharge);
  const estimeesAvant = new Set(precedent.recurrentes.filter((x) => x.a_confirmer).map(cleCharge));
  for (const r of courant.recurrentes.filter((x) => !x.a_confirmer && !estimeesAvant.has(cleCharge(x)))) {
    plus(r.libelle, arrondi(Number(r.montant) - (chargesAvant.get(cleCharge(r)) ?? 0)));
  }

  const revenusApres = totaux(courant.revenus, (r) => r.libelle);
  for (const [libelle, montant] of totaux(precedent.revenus, (r) => r.libelle)) {
    if (!revenusApres.has(libelle) || revenusApres.get(libelle) === 0) ecarts.push({texte: `pas de ${libelle}`, ecart: montant});
    else moins(libelle, arrondi(montant - revenusApres.get(libelle)));
  }

  for (const m of membres) {
    const avant = precedent.membresMois.find((x) => x.membre_id === m.id);
    const apres = courant.membresMois.find((x) => x.membre_id === m.id);
    if (avant && apres) moins(`salaire ${de(m.prenom)}`, arrondi(Number(avant.salaire) - Number(apres.salaire)));
  }

  return ecarts.filter((e) => e.ecart >= SEUIL_RAISON).sort((a, b) => b.ecart - a.ecart).slice(0, 3).map((e) => e.texte);
}

// Projection au rythme des 3 derniers mois terminés (avant moisCourant, pas avant le début ; un mois sans versement vaut 0).
// statut : 'atteint', 'projete', 'non_atteint' (rythme ≤ 0) ou 'sans' (aucun mois terminé depuis le début).
// Objectif réalisable ? Deux indices : le rythme des derniers versements (projectionObjectif) et la place que
// laisse le reste libre du mois (resteLibre, null s'il est inconnu) pour l'effort mensuel encore nécessaire.
// → {niveau: 'atteint' | 'realisable' | 'serre' | 'difficile' | 'inconnu', rythmeOk, resteOk, effort}
export function faisabiliteObjectif(objectif, projection, resteLibre) {
  const effort = projection.effortNecessaire;
  if (projection.statut === 'atteint') return {niveau: 'atteint', rythmeOk: true, resteOk: true, effort: 0};
  if (projection.echu) return {niveau: 'difficile', rythmeOk: false, resteOk: false, effort};
  // Plus aucun versement ces derniers mois (non_atteint) : le rythme ne suffit pas ; trop récent (sans) : pas d'avis
  let rythmeOk = null;
  if (projection.statut === 'projete') rythmeOk = projection.moisAtteinte <= objectif.fin;
  else if (projection.statut === 'non_atteint') rythmeOk = false;
  const resteOk = resteLibre == null ? null : effort <= resteLibre;
  const indices = [rythmeOk, resteOk].filter((x) => x != null);
  let niveau;
  if (!indices.length) niveau = 'inconnu';
  else if (indices.every(Boolean)) niveau = 'realisable';
  else if (indices.some(Boolean)) niveau = 'serre';
  else niveau = 'difficile';
  return {niveau, rythmeOk, resteOk, effort};
}

export function projectionObjectif(objectif, versements, moisCourant) {
  const cible = Number(objectif.cible);
  const siens = versements.filter((v) => v.objectif_id === objectif.id);
  const s = suiviObjectif({...objectif, cible}, siens, moisCourant);
  const base = {rythme: null, moisAtteinte: null, enAvance: false, effortNecessaire: s.effortRecalcule, echu: s.echu};
  if (s.statut === 'atteint') return {...base, statut: 'atteint'};

  const termines = [1, 2, 3].map((n) => decalerMois(moisCourant, -n)).filter((cle) => cle >= objectif.debut);
  if (!termines.length) return {...base, statut: 'sans'};
  const rythmeExact = sommeMontants(siens.filter((v) => termines.includes(v.mois_cle))) / termines.length;
  const rythme = arrondi(rythmeExact);
  if (rythme <= 0) return {...base, rythme, statut: 'non_atteint'};

  // Comme suiviObjectif : si l'on a déjà versé ce mois-ci, la suite commence le mois prochain
  const depart = siens.some((v) => v.mois_cle === moisCourant) ? decalerMois(moisCourant, 1) : moisCourant;
  const moisNecessaires = Math.ceil(arrondi((cible - s.verse) / rythmeExact));
  const moisAtteinte = decalerMois(depart, moisNecessaires - 1);
  return {...base, statut: 'projete', rythme, moisAtteinte, enAvance: moisAtteinte < objectif.fin};
}
