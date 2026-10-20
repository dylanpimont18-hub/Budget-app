// Démarrage et routage : connexion → foyer → ouverture du mois → onglets.
import {sb, session, surAuth, chargerFoyer, deconnecter} from './db.js';
import {etat, abonner, recharger, rechargerEnFond, demarrerTempsReel, arreterTempsReel} from './etat.js';
import {cleMois} from './calc.js';
import {el, toast} from './ui.js';
import {rendreConnexion, rendreChoixFoyer} from './vues/connexion.js';
import {rendreOuverture} from './vues/ouverture.js';
import {rendreRecurrentes} from './vues/recurrentes.js';
import {rendreDepenses} from './vues/depenses.js';
import {initAjoutRapide} from './vues/ajout-rapide.js';

const vue = document.getElementById('vue');
const nav = document.getElementById('onglets');
const btnAjout = document.getElementById('btn-ajout-rapide');

const rendus = {
  recurrentes: rendreRecurrentes,
  depenses: rendreDepenses,
  // Provisoire : remplacé par le tableau de bord (Task 10)
  tableau: (c) => c.append(
    el('h1', {}, etat.foyer?.nom ?? 'Budget'),
    el('p', {}, "Code d'invitation : ",el('strong', {}, etat.foyer?.code_invitation ?? '')),
    el('button', {class: 'btn-texte', type: 'button', onclick: seDeconnecter}, 'Se déconnecter')),
};
let ongletActif = null;

// Affiche un écran hors onglets (connexion, foyer, ouverture du mois)
function afficherEcran(rendre) {
  ongletActif = null;
  nav.hidden = true;
  btnAjout.hidden = true;
  vue.replaceChildren();
  rendre(vue);
}

export function afficherOnglet(nom, options) {
  ongletActif = nom;
  nav.hidden = false;
  btnAjout.hidden = false;
  for (const b of nav.querySelectorAll('button')) {
    b.setAttribute('aria-current', b.dataset.onglet === nom ? 'page' : 'false');
  }
  rendreOngletActif(options);
  window.scrollTo(0, 0);
}

function rendreOngletActif(options) {
  if (!ongletActif) return;
  vue.replaceChildren();
  rendus[ongletActif]?.(vue, options);
}

nav.addEventListener('click', (e) => {
  const bouton = e.target.closest('button[data-onglet]');
  if (bouton) afficherOnglet(bouton.dataset.onglet);
});

abonner(() => rendreOngletActif());
initAjoutRapide(btnAjout);

// ── Hors ligne ─────────────────────────────────────────────────────────
const bandeau = document.getElementById('hors-ligne');
const majConnexion = () => { bandeau.hidden = navigator.onLine; };
window.addEventListener('online', majConnexion);
window.addEventListener('offline', majConnexion);
majConnexion();

// ── Démarrage ──────────────────────────────────────────────────────────
export async function seDeconnecter() {
  try {
    await deconnecter();
  } catch (e) {
    toast(e.message, {type: 'erreur'});
  }
}

function afficherErreurDemarrage(message) {
  afficherEcran((c) => c.append(
    el('p', {class: 'message-erreur'}, message),
    el('button', {class: 'btn-primaire', type: 'button', onclick: demarrer}, 'Réessayer')));
}

let demarrage = null;
function demarrer() {
  // Un seul démarrage à la fois (connexion + événement d'auth simultanés)
  demarrage ??= lancer().finally(() => { demarrage = null; });
  return demarrage;
}

async function lancer() {
  try {
    etat.session = await session();
    if (!etat.session) {
      Object.assign(etat, {foyer: null, membres: [], moi: null, donnees: null});
      afficherEcran((c) => rendreConnexion(c, {apres: demarrer}));
      return;
    }
    const foyer = await chargerFoyer();
    if (!foyer) {
      afficherEcran((c) => rendreChoixFoyer(c, {apres: demarrer}));
      return;
    }
    Object.assign(etat, foyer);

    etat.moisCourantCle = cleMois();
    etat.moisCle = etat.moisCourantCle;
    await recharger();
    demarrerTempsReel();
    if (!etat.donnees.mois) {
      afficherEcran((c) => rendreOuverture(c, {apres: () => afficherOnglet('recurrentes', {revue: true})}));
      return;
    }
    afficherOnglet('tableau');
  } catch (e) {
    afficherErreurDemarrage(e.message);
  }
}

surAuth((evenement) => {
  if (evenement === 'SIGNED_OUT') {
    arreterTempsReel();
    demarrer();
  }
});

// Au retour au premier plan (iPhone), on resynchronise : le temps réel a pu être coupé
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && etat.foyer && etat.donnees) rechargerEnFond();
});

// Accès console pour le débogage
globalThis.budget = {sb, etat};

demarrer();
