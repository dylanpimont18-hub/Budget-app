// Store : état courant de l'app, rechargement depuis Supabase et temps réel.
import {chargerFoyer, chargerMois, chargerCategories, chargerObjectifs, listerMois, ecouter} from './db.js';
import {toast} from './ui.js';

export const etat = {
  session: null,
  foyer: null,
  membres: [],
  moi: null,
  moisCle: null,          // mois affiché
  moisCourantCle: null,   // mois calendaire
  donnees: null,
};

const abonnes = new Set();

export function abonner(fn) {
  abonnes.add(fn);
  return () => abonnes.delete(fn);
}

export function notifier() {
  for (const fn of abonnes) fn(etat);
}

let generation = 0;

// Recharge tout ce qu'affichent les vues pour etat.moisCle.
// Si un rechargement plus récent a été lancé entre-temps, ce résultat périmé est ignoré.
export async function recharger() {
  const numero = ++generation;
  const foyerId = etat.foyer.id;
  const [foyer, mois, categories, objectifs, moisDisponibles] = await Promise.all([
    chargerFoyer(),
    chargerMois(foyerId, etat.moisCle),
    chargerCategories(foyerId),
    chargerObjectifs(foyerId),
    listerMois(foyerId),
  ]);
  if (numero !== generation) return;
  if (foyer) Object.assign(etat, foyer);
  etat.donnees = {
    ...mois,
    categories,
    objectifs: objectifs.objectifs,
    versementsTous: objectifs.versements,
    moisDisponibles,
  };
  notifier();
}

export async function changerMois(cle) {
  etat.moisCle = cle;
  await recharger();
}

// Recharge en tâche de fond, en signalant l'erreur sans bloquer
export function rechargerEnFond() {
  recharger().catch((e) => toast(e.message, {type: 'erreur'}));
}

let desabonnerTempsReel = null;
let minuteur = null;

export function demarrerTempsReel() {
  arreterTempsReel();
  desabonnerTempsReel = ecouter(etat.foyer.id, () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(rechargerEnFond, 300);
  });
}

export function arreterTempsReel() {
  clearTimeout(minuteur);
  desabonnerTempsReel?.();
  desabonnerTempsReel = null;
}
