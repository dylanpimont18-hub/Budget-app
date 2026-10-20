// Démarrage et routage : connexion → foyer → ouverture du mois → onglets.
import {sb, session} from './db.js';
import {etat, abonner} from './etat.js';
import {el} from './ui.js';

const vue = document.getElementById('vue');
const nav = document.getElementById('onglets');
const btnAjout = document.getElementById('btn-ajout-rapide');

const rendus = {};
let ongletActif = null;

// Affiche un écran hors onglets (connexion, foyer, ouverture du mois)
function afficherEcran(rendre) {
  ongletActif = null;
  nav.hidden = true;
  btnAjout.hidden = true;
  vue.replaceChildren();
  rendre(vue);
}

export function afficherOnglet(nom) {
  ongletActif = nom;
  nav.hidden = false;
  btnAjout.hidden = false;
  for (const b of nav.querySelectorAll('button')) {
    b.setAttribute('aria-current', b.dataset.onglet === nom ? 'page' : 'false');
  }
  rendreOngletActif();
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

// ── Hors ligne ─────────────────────────────────────────────────────────
const bandeau = document.getElementById('hors-ligne');
const majConnexion = () => { bandeau.hidden = navigator.onLine; };
window.addEventListener('online', majConnexion);
window.addEventListener('offline', majConnexion);
majConnexion();

// ── Démarrage ──────────────────────────────────────────────────────────
async function demarrer() {
  try {
    etat.session = await session();
  } catch (e) {
    afficherEcran((c) => c.append(el('p', {class: 'message-erreur'}, e.message)));
    return;
  }
  if (!etat.session) {
    afficherEcran((c) => c.append(el('section', {class: 'ecran-connexion'}, el('h1', {}, 'Budget familial'))));
    return;
  }
  afficherOnglet('tableau');
}

// Accès console pour le débogage
globalThis.budget = {sb, etat};

demarrer();
