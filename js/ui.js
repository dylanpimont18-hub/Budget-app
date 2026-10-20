// Helpers DOM : création d'éléments, feuille modale du bas, toast.

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

function ajouter(parent, enfants) {
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
