// Helpers DOM : création d'éléments, feuille modale du bas, toast, champ montant.
import {parseMontant} from './calc.js';

// el('button', {class: 'btn', onclick: f}, 'Texte', autreElement)
// Les textes sont insérés en nœuds texte : jamais d'innerHTML pour des données utilisateur.
export function el(tag, attrs = {}, ...enfants) {
  const noeud = document.createElement(tag);
  for (const [cle, valeur] of Object.entries(attrs ?? {})) {
    if (valeur == null || valeur === false) continue;
    if (cle.startsWith('on') && typeof valeur === 'function') {
      noeud.addEventListener(cle.slice(2), valeur);
    } else if (cle === 'class') {
      noeud.className = valeur;
    } else if (cle === 'dataset') {
      Object.assign(noeud.dataset, valeur);
    } else if (cle === 'style' && typeof valeur === 'object') {
      Object.assign(noeud.style, valeur);
    } else if (cle in noeud && typeof valeur !== 'string') {
      noeud[cle] = valeur;
    } else if (cle === 'value') {
      noeud.value = valeur;
    } else {
      noeud.setAttribute(cle, valeur === true ? '' : valeur);
    }
  }
  ajouter(noeud, enfants);
  return noeud;
}

// Ajoute des enfants en aplatissant les tableaux et en ignorant null/false (contrairement à Element.append)
export function ajouter(parent, enfants) {
  for (const enfant of enfants) {
    if (enfant == null || enfant === false) continue;
    if (Array.isArray(enfant)) ajouter(parent, enfant);
    else parent.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
  }
}

// Feuille modale qui monte du bas ; fermeture par ✕, clic sur le fond ou Échap.
export function ouvrirFeuille(contenu, {titre = '', surFermeture} = {}) {
  const conteneur = document.getElementById('feuilles');
  const precedent = document.activeElement;
  let ouverte = true;

  const fermer = () => {
    if (!ouverte) return;
    ouverte = false;
    document.removeEventListener('keydown', surTouche);
    fond.classList.remove('ouverte');
    setTimeout(() => fond.remove(), 200);
    if (!conteneur.querySelector('.fond-feuille.ouverte')) document.body.classList.remove('feuille-ouverte');
    precedent?.focus?.();
    surFermeture?.();
  };
  const surTouche = (e) => { if (e.key === 'Escape') fermer(); };

  const idTitre = 'titre-feuille-' + Math.random().toString(36).slice(2, 8);
  const feuille = el('section', {class: 'feuille', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': idTitre},
    el('header', {class: 'feuille-entete'},
      el('h2', {id: idTitre}, titre),
      el('button', {class: 'btn-icone', type: 'button', 'aria-label': 'Fermer', onclick: fermer}, '✕')),
    el('div', {class: 'feuille-corps'}, contenu));
  const fond = el('div', {class: 'fond-feuille', onclick: (e) => { if (e.target === fond) fermer(); }}, feuille);

  conteneur.append(fond);
  document.body.classList.add('feuille-ouverte');
  document.addEventListener('keydown', surTouche);
  requestAnimationFrame(() => fond.classList.add('ouverte'));
  return {fermer};
}

export function toast(message, {type = 'info'} = {}) {
  const t = el('div', {class: `toast toast-${type}`, role: type === 'erreur' ? 'alert' : 'status'}, message);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('visible'));
  setTimeout(() => {
    t.classList.remove('visible');
    setTimeout(() => t.remove(), 300);
  }, type === 'erreur' ? 4500 : 2800);
}

// Écrit un nombre au format de saisie français (12.5 → "12,5")
export const versSaisie = (n) => (n == null ? '' : String(n).replace('.', ','));

// Champ montant validé en direct.
// vide : 'interdit' (requis), 'zero' (vide = 0) ou 'null' (vide = non renseigné)
// strict : refuse 0 (dépenses)
export function champMontant({id, etiquette, valeur = null, negatif = false, vide = 'interdit', strict = false,
                              grand = false, surChange} = {}) {
  const input = el('input', {class: 'champ montant' + (grand ? ' grand' : ''), id, type: 'text', inputmode: 'decimal',
    autocomplete: 'off', placeholder: '0,00', value: versSaisie(valeur)});
  const message = el('p', {class: 'message-erreur', 'aria-live': 'polite'});
  let touche = false;

  function lire() {
    const texte = input.value.trim();
    if (!texte) {
      if (vide === 'zero') return {ok: true, valeur: 0};
      if (vide === 'null') return {ok: true, valeur: null};
      return {ok: false, valeur: null, message: 'Montant requis'};
    }
    const n = parseMontant(texte, {negatif});
    if (n == null || (strict && n <= 0)) return {ok: false, valeur: null, message: 'Montant invalide'};
    return {ok: true, valeur: n};
  }

  function afficher(forcer = false) {
    const r = lire();
    const visible = forcer || touche;
    input.classList.toggle('invalide', visible && !r.ok);
    input.setAttribute('aria-invalid', String(!r.ok));
    message.textContent = visible && !r.ok ? r.message : '';
    return r;
  }

  input.addEventListener('input', () => { touche = true; afficher(); surChange?.(); });

  const ligne = negatif
    ? el('div', {class: 'rangee', style: {alignItems: 'center'}}, input,
        el('button', {class: 'btn-secondaire', type: 'button', style: {flex: '0 0 56px', width: '56px'},
          'aria-label': 'Changer le signe', onclick: () => {
            const t = input.value.trim();
            input.value = t.startsWith('-') ? t.slice(1) : '-' + t;
            touche = true; afficher(); surChange?.();
          }}, '±'))
    : input;

  const element = el('div', {},
    etiquette ? el('label', {class: 'etiquette', for: id}, etiquette) : null,
    ligne, message);
  return {element, input, lire, valider: () => afficher(true)};
}
