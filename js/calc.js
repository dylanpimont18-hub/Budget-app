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
// Une charge encore à confirmer n'est jamais citée (son montant n'est qu'une estimation).
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
  for (const r of courant.recurrentes.filter((x) => !x.a_confirmer)) {
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
