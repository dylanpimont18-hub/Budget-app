// Store : état courant de l'app et notification des vues.

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

export async function recharger() {
  notifier();
}
