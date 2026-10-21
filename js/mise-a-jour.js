// Mise à jour de l'app sans la réinstaller : compare la version qui tourne (js/version.js, inscrite au déploiement)
// à version.json et propose un bandeau. « Mettre à jour » re-télécharge chaque fichier avant de recharger :
// le cache du navigateur ne peut plus resservir l'ancien code. Si l'ancien code tourne encore après coup, on le dit.
import {VERSION} from './version.js';
import {toast} from './ui.js';

const CLE_TENTATIVE = 'budget.miseAJour';   // version visée par la dernière mise à jour lancée
const INTERVALLE = 5 * 60 * 1000;

// 'a_jour', 'disponible', ou 'en_attente' (mise à jour déjà tentée vers cette version, l'ancien code tourne encore)
export function etatMiseAJour(locale, enLigne, tentative) {
  if (locale === '__VERSION__' || !enLigne || enLigne === locale) return 'a_jour';
  return tentative === enLigne ? 'en_attente' : 'disponible';
}

function lireTentative() {
  try {
    return sessionStorage.getItem(CLE_TENTATIVE);
  } catch {
    return null;
  }
}

function ecrireTentative(version) {
  try {
    if (version == null) sessionStorage.removeItem(CLE_TENTATIVE);
    else sessionStorage.setItem(CLE_TENTATIVE, version);
  } catch {
    // stockage indisponible : seul le message « pas encore arrivée » est perdu
  }
}

// {version, fichiers} publié au déploiement ; null hors ligne ou en cas d'erreur
async function versionEnLigne() {
  try {
    const reponse = await fetch('version.json', {cache: 'no-store'});
    return reponse.ok ? await reponse.json() : null;
  } catch {
    return null;
  }
}

async function mettreAJour(infos, bouton) {
  bouton.disabled = true;
  bouton.textContent = 'Mise à jour…';
  ecrireTentative(infos.version);
  await Promise.allSettled((infos.fichiers ?? []).map((f) => fetch(f, {cache: 'reload'})));
  location.reload();
}

async function verifier(bandeau) {
  const infos = await versionEnLigne();
  const tentative = lireTentative();
  const etat = etatMiseAJour(VERSION, infos?.version ?? null, tentative);
  if (etat === 'a_jour') {
    bandeau.hidden = true;
    if (tentative && infos?.version === VERSION) toast(`App mise à jour (version ${VERSION})`);
    if (tentative && infos) ecrireTentative(null);
    return;
  }
  const bouton = bandeau.querySelector('button');
  bandeau.querySelector('.texte').textContent = etat === 'disponible'
    ? 'Nouvelle version disponible'
    : 'La nouvelle version n\'est pas encore arrivée sur cet appareil';
  bouton.textContent = etat === 'disponible' ? 'Mettre à jour' : 'Réessayer';
  bouton.disabled = false;
  bouton.onclick = () => mettreAJour(infos, bouton);
  bandeau.hidden = false;
}

// Au démarrage, au retour au premier plan, puis toutes les 5 minutes tant que l'app est affichée
export function initMiseAJour(bandeau) {
  if (VERSION === '__VERSION__') return;
  verifier(bandeau);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') verifier(bandeau);
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') verifier(bandeau);
  }, INTERVALLE);
}
