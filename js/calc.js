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

export function syntheseMois({salaires = [], revenus = [], recurrentes = [], budgets = [], versements = []}) {
  const totalRevenus = arrondi(somme(salaires) + somme(revenus));
  const chargesFixes = somme(recurrentes);
  const totalBudgets = somme(budgets);
  const objectifs = somme(versements);
  const resteLibre = arrondi(totalRevenus - chargesFixes - totalBudgets - objectifs);
  return {
    revenus: totalRevenus,
    chargesFixes,
    budgets: totalBudgets,
    objectifs,
    resteLibre,
    pctResteLibre: totalRevenus > 0 ? arrondi((resteLibre / totalRevenus) * 100) : null,
  };
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
  const moisEcoules = Math.min(nbMois(debut, fin), nbMois(debut, moisCourant));
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
