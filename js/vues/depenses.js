// Onglet Dépenses : journal des dépenses ponctuelles du mois, historique mensuel.
// Contient aussi le formulaire de dépense, réutilisé par l'ajout rapide.
import {modifierDepense, supprimerDepense} from '../db.js';
import {etat, changerMois, recharger} from '../etat.js';
import {formatEUR, libelleMois} from '../calc.js';
import {el, ouvrirFeuille, toast, champMontant} from '../ui.js';

const CLE_PAYEUR = 'budget.dernierPayeur';
let regroupement = 'date';

const formatJour = new Intl.DateTimeFormat('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'});

export function aujourdhui() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function libelleJour(iso) {
  const [a, m, j] = iso.split('-').map(Number);
  return formatJour.format(new Date(a, m - 1, j));
}

export function categorieDe(id) {
  return etat.donnees.categories.find((c) => c.id === id) ?? {nom: 'Catégorie supprimée', icone: '❔'};
}

function membreDe(id) {
  return etat.membres.find((m) => m.id === id);
}

function lireDernierPayeur() {
  try {
    return localStorage.getItem(CLE_PAYEUR);
  } catch {
    return null;
  }
}

function retenirPayeur(id) {
  try {
    localStorage.setItem(CLE_PAYEUR, id);
  } catch {
    // stockage indisponible (navigation privée) : sans conséquence
  }
}

// ── Formulaire de dépense ──────────────────────────────────────────────

// onValider({date, montant, categorie_id, membre_id, libelle}) est asynchrone ; une erreur levée s'affiche dans le formulaire.
export function formulaireDepense({depense = null, onValider}) {
  const categories = etat.donnees.categories
    .filter((c) => c.active || c.id === depense?.categorie_id)
    .sort((a, b) => a.ordre - b.ordre);

  let categorieId = depense?.categorie_id ?? null;
  const payeurInitial = depense?.membre_id ?? lireDernierPayeur();
  let membreId = etat.membres.some((m) => m.id === payeurInitial) ? payeurInitial : etat.moi?.id;

  const montant = champMontant({id: 'depense-montant', etiquette: 'Montant', valeur: depense?.montant ?? null,
    strict: true, grand: true});
  const message = el('p', {class: 'message-erreur', 'aria-live': 'polite'});

  const grille = el('div', {class: 'grille-choix', role: 'group', 'aria-label': 'Catégorie'},
    categories.map((c) => el('button', {type: 'button', 'aria-pressed': String(c.id === categorieId), onclick: (e) => {
      categorieId = c.id;
      for (const b of grille.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
    }}, el('span', {class: 'ico', 'aria-hidden': 'true'}, c.icone ?? '•'), c.nom)));

  const payeurs = el('div', {class: 'segment', role: 'group', 'aria-label': 'Payé par'},
    etat.membres.map((m) => el('button', {type: 'button', 'aria-pressed': String(m.id === membreId), onclick: (e) => {
      membreId = m.id;
      for (const b of payeurs.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
    }}, m.prenom)));

  const libelle = el('input', {class: 'champ', id: 'depense-libelle', value: depense?.libelle ?? '', autocomplete: 'off',
    placeholder: 'Ex. : marché, pharmacie…'});
  const date = el('input', {class: 'champ', id: 'depense-date', type: 'date', value: depense?.date ?? aujourdhui(), required: true});

  const details = el('details', {class: 'repliable', open: Boolean(depense?.libelle)},
    el('summary', {}, 'Libellé (facultatif)'), libelle);

  const valider = el('button', {class: 'btn-primaire', type: 'submit'}, depense ? 'Enregistrer' : 'Ajouter la dépense');

  async function soumettre(e) {
    e.preventDefault();
    message.textContent = '';
    const m = montant.valider();
    if (!m.ok) { montant.input.focus(); return; }
    if (!categorieId) { message.textContent = 'Choisis une catégorie'; return; }
    if (!membreId) { message.textContent = 'Indique qui a payé'; return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) { message.textContent = 'Date invalide'; return; }
    valider.disabled = true;
    try {
      await onValider({date: date.value, montant: m.valeur, categorie_id: categorieId, membre_id: membreId,
        libelle: libelle.value.trim()});
      retenirPayeur(membreId);
    } catch (err) {
      message.textContent = err.message;
      valider.disabled = false;
    }
  }

  return el('form', {class: 'formulaire', novalidate: true, onsubmit: soumettre},
    montant.element,
    el('div', {}, el('span', {class: 'etiquette'}, 'Catégorie'), grille),
    el('div', {}, el('span', {class: 'etiquette'}, 'Payé par'), payeurs),
    details,
    el('div', {}, el('label', {class: 'etiquette', for: 'depense-date'}, 'Date'), date),
    message,
    valider);
}

// ── Onglet ─────────────────────────────────────────────────────────────

export function rendreDepenses(conteneur) {
  const {depenses, moisDisponibles} = etat.donnees;
  const cle = etat.moisCle;
  const mois = moisDisponibles.includes(cle) ? moisDisponibles : [cle, ...moisDisponibles];
  const idx = mois.indexOf(cle);
  const total = depenses.reduce((t, d) => t + Number(d.montant), 0);

  const naviguer = (nouvelle) => changerMois(nouvelle).catch((e) => toast(e.message, {type: 'erreur'}));

  const btnMode = (mode, texte) => el('button', {type: 'button', 'aria-pressed': String(regroupement === mode), onclick: () => {
    regroupement = mode;
    conteneur.replaceChildren();
    rendreDepenses(conteneur);
  }}, texte);

  conteneur.append(
    el('div', {class: 'selecteur-mois'},
      el('button', {class: 'btn-icone', type: 'button', 'aria-label': 'Mois précédent', disabled: idx >= mois.length - 1,
        onclick: () => naviguer(mois[idx + 1])}, '‹'),
      el('h1', {}, libelleMois(cle)),
      el('button', {class: 'btn-icone', type: 'button', 'aria-label': 'Mois suivant', disabled: idx <= 0,
        onclick: () => naviguer(mois[idx - 1])}, '›')),
    el('div', {class: 'entete-vue'},
      el('span', {class: 'attenue'}, `${depenses.length} dépense${depenses.length > 1 ? 's' : ''}`),
      el('span', {class: 'total-entete montant'}, formatEUR(total))),
    el('div', {class: 'segment', style: {marginBottom: '4px'}}, btnMode('date', 'Par date'), btnMode('categorie', 'Par catégorie')));

  if (!depenses.length) {
    conteneur.append(el('p', {class: 'vide-liste'}, 'Aucune dépense ce mois-ci'));
    return;
  }

  for (const groupe of grouper(depenses)) {
    conteneur.append(
      el('div', {class: 'titre-groupe'}, el('span', {}, groupe.titre), el('span', {class: 'montant'}, formatEUR(groupe.total))),
      el('ul', {class: 'liste'}, groupe.depenses.map((d) => el('li', {}, ligneDepense(d)))));
  }
}

function grouper(depenses) {
  const groupes = new Map();
  for (const d of depenses) {
    const cle = regroupement === 'date' ? d.date : d.categorie_id;
    if (!groupes.has(cle)) {
      const titre = regroupement === 'date' ? libelleJour(d.date) : `${categorieDe(cle).icone ?? ''} ${categorieDe(cle).nom}`;
      groupes.set(cle, {titre, total: 0, depenses: []});
    }
    const g = groupes.get(cle);
    g.total += Number(d.montant);
    g.depenses.push(d);
  }
  const liste = [...groupes.values()];
  return regroupement === 'date' ? liste : liste.sort((a, b) => b.total - a.total);
}

function ligneDepense(d) {
  const categorie = categorieDe(d.categorie_id);
  const membre = membreDe(d.membre_id);
  const sous = regroupement === 'date'
    ? (d.libelle ? categorie.nom : null)
    : libelleJour(d.date);
  return el('button', {class: 'ligne', type: 'button', onclick: () => ouvrirEdition(d)},
    el('span', {class: 'ligne-icone', 'aria-hidden': 'true'}, categorie.icone ?? '•'),
    el('span', {class: 'ligne-texte'},
      el('div', {class: 'ligne-titre'}, d.libelle || categorie.nom),
      sous ? el('div', {class: 'ligne-sous'}, sous) : null),
    el('span', {class: 'pastille', title: membre?.prenom ?? '', 'aria-label': `Payé par ${membre?.prenom ?? '?'}`},
      (membre?.prenom ?? '?').charAt(0).toUpperCase()),
    el('span', {class: 'ligne-montant montant'}, formatEUR(Number(d.montant))));
}

function ouvrirEdition(depense) {
  let feuille;
  const form = formulaireDepense({
    depense,
    onValider: async (champs) => {
      await modifierDepense(depense.id, champs);
      feuille.fermer();
      toast('Dépense modifiée');
      await recharger();
    },
  });
  const supprimer = el('button', {class: 'btn-danger', type: 'button', style: {marginTop: '8px'}, onclick: async (e) => {
    const bouton = e.currentTarget;
    if (!confirm('Supprimer cette dépense ?')) return;
    bouton.disabled = true;
    try {
      await supprimerDepense(depense.id);
      feuille.fermer();
      toast('Dépense supprimée');
      await recharger();
    } catch (err) {
      toast(err.message, {type: 'erreur'});
      bouton.disabled = false;
    }
  }}, 'Supprimer');
  feuille = ouvrirFeuille(el('div', {}, form, supprimer), {titre: 'Modifier la dépense'});
}
