// Store : état courant de l'app, rechargement depuis Supabase et temps réel.
import {chargerFoyer, chargerMois, chargerCategories, chargerObjectifs, listerMois, ecouter} from './db.js';
import {toast} from './ui.js';

export const etat = {
  session: null,
  foyer: null,
  membres: [],
  anciensMembres: [],   // retirés du foyer (prénom des dépenses passées)
  moi: null,
  moisCle: null,          // mois affiché
  moisCourantCle: null,   // mois en cours : le dernier ouvert (calc.moisActif)
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

// Mois en cours : ses modifications valent aussi pour les mois suivants (modèle). Un mois passé se corrige seul.
export const estMoisCourant = () => etat.moisCle === etat.moisCourantCle;

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
const ecouteursTempsReel = new Set();

// Prévenu à chaque événement temps réel (les rapports rechargent leur propre plage de mois)
export function surTempsReel(fn) {
  ecouteursTempsReel.add(fn);
  return () => ecouteursTempsReel.delete(fn);
}

export function demarrerTempsReel() {
  arreterTempsReel();
  desabonnerTempsReel = ecouter(etat.foyer.id, () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(rechargerEnFond, 300);
    for (const fn of ecouteursTempsReel) fn();
  });
}

export function arreterTempsReel() {
  clearTimeout(minuteur);
  desabonnerTempsReel?.();
  desabonnerTempsReel = null;
}
