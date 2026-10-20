// Feuilles de réglage ouvertes depuis l'onglet Budget : autres revenus du mois, catégories, profil.
import {ajouterRevenu, modifierRevenu, supprimerRevenu, creerCategorie, modifierCategorie, activerCategorie,
  modifierProfil} from '../db.js';
import {etat, recharger} from '../etat.js';
import {formatEUR} from '../calc.js';
import {el, ouvrirFeuille, toast, champMontant, caseACocher} from '../ui.js';

const ICONES_CATEGORIE = ['🛒', '⛽', '🎉', '👕', '⚽', '💊', '🔧', '🏖️', '🎁', '📦', '🍔', '🐾', '📚', '💇', '🚌', '🏠'];

// Enregistre, ferme la feuille, recharge ; l'erreur s'affiche dans le message
async function executer({bouton, message, feuille, action, succes}) {
  bouton.disabled = true;
  if (message) message.textContent = '';
  try {
    await action();
    feuille.fermer();
    toast(succes);
    await recharger();
  } catch (err) {
    if (message) message.textContent = err.message;
    else toast(err.message, {type: 'erreur'});
    bouton.disabled = false;
  }
}

function grilleIcones(icones, choisie, surChoix) {
  const grille = el('div', {class: 'grille-choix icones'}, icones.map((i) =>
    el('button', {type: 'button', 'aria-pressed': String(i === choisie), 'aria-label': `Icône ${i}`, onclick: (e) => {
      surChoix(i);
      for (const b of grille.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
    }}, i)));
  return grille;
}

// ── Autres revenus du mois ─────────────────────────────────────────────

export function ouvrirRevenus() {
  const {revenus} = etat.donnees;
  let feuille;
  const contenu = el('div', {class: 'formulaire'},
    el('p', {class: 'attenue', style: {margin: 0}}, 'CAF, primes, remboursements… arrivés ou attendus ce mois-ci.'),
    revenus.length
      ? el('ul', {class: 'liste'}, revenus.map((r) => el('li', {},
          el('button', {class: 'ligne', type: 'button', onclick: () => { feuille.fermer(); editerRevenu(r); }},
            el('span', {class: 'ligne-texte'},
              el('div', {class: 'ligne-titre'}, r.libelle),
              el('div', {class: 'ligne-sous'}, r.dans_solde ? 'Déjà sur le compte' : 'À recevoir')),
            el('span', {class: 'ligne-montant montant'}, formatEUR(Number(r.montant)))))))
      : el('p', {class: 'vide-liste'}, 'Aucun autre revenu ce mois-ci.'),
    el('button', {class: 'btn-secondaire', type: 'button', onclick: () => { feuille.fermer(); editerRevenu(null); }},
      '+ Ajouter un revenu'));
  feuille = ouvrirFeuille(contenu, {titre: 'Autres revenus'});
}

function editerRevenu(revenu) {
  const libelle = el('input', {class: 'champ', id: 'revenu-libelle', value: revenu?.libelle ?? '', autocomplete: 'off',
    placeholder: 'Ex. : prime, remboursement'});
  const montant = champMontant({id: 'revenu-montant', etiquette: 'Montant', valeur: revenu?.montant ?? null, strict: true});
  const dejaRecu = caseACocher({etiquette: 'Déjà sur le compte quand le solde a été saisi', valeur: revenu?.dans_solde ?? false});
  const message = el('p', {class: 'message-erreur', 'aria-live': 'polite'});
  const bouton = el('button', {class: 'btn-primaire', type: 'submit'}, revenu ? 'Enregistrer' : 'Ajouter');
  let feuille;
  const form = el('form', {class: 'formulaire', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const m = montant.valider();
    if (!libelle.value.trim()) { message.textContent = 'Indique un libellé'; return; }
    if (!m.ok) return;
    const champs = {libelle: libelle.value.trim(), montant: m.valeur, dans_solde: dejaRecu.lire()};
    executer({bouton, message, feuille, succes: revenu ? 'Revenu modifié' : 'Revenu ajouté',
      action: () => (revenu ? modifierRevenu(revenu.id, champs)
                            : ajouterRevenu(etat.foyer.id, etat.donnees.mois.id, champs))});
  }},
  el('div', {}, el('label', {class: 'etiquette', for: 'revenu-libelle'}, 'Libellé'), libelle),
  montant.element,
  dejaRecu.element,
  el('p', {class: 'attenue', style: {margin: 0}}, 'Coché, le revenu est déjà compris dans un solde : il ne s\'y ajoute pas.'),
  message, bouton,
  revenu ? el('button', {class: 'btn-danger', type: 'button', onclick: (e) => {
    if (!confirm(`Supprimer « ${revenu.libelle} » ?`)) return;
    executer({bouton: e.currentTarget, message, feuille, succes: 'Revenu supprimé', action: () => supprimerRevenu(revenu.id)});
  }}, 'Supprimer') : null);
  feuille = ouvrirFeuille(form, {titre: revenu ? 'Modifier le revenu' : 'Nouveau revenu'});
  libelle.focus();
}

// ── Catégories ─────────────────────────────────────────────────────────

const moisModifiable = () => (etat.moisCle === etat.moisCourantCle ? etat.donnees.mois?.id ?? null : null);

export function ouvrirCategories() {
  const categories = [...etat.donnees.categories].sort((a, b) => a.ordre - b.ordre);
  const actives = categories.filter((c) => c.active);
  const inactives = categories.filter((c) => !c.active);
  let feuille;
  const ligne = (c) => el('li', {},
    el('button', {class: 'ligne', type: 'button', onclick: () => { feuille.fermer(); editerCategorie(c); }},
      el('span', {class: 'ligne-icone', 'aria-hidden': 'true'}, c.icone ?? '•'),
      el('span', {class: 'ligne-texte'},
        el('div', {class: 'ligne-titre'}, c.nom),
        el('div', {class: 'ligne-sous'}, `Budget par défaut ${formatEUR(Number(c.budget_defaut))}`))));
  const contenu = el('div', {class: 'formulaire'},
    el('ul', {class: 'liste'}, actives.map(ligne)),
    el('button', {class: 'btn-secondaire', type: 'button', onclick: () => { feuille.fermer(); editerCategorie(null); }},
      '+ Nouvelle catégorie'),
    inactives.length
      ? el('details', {class: 'repliable'},
          el('summary', {}, `Désactivées (${inactives.length})`),
          el('ul', {class: 'liste'}, inactives.map(ligne)))
      : null);
  feuille = ouvrirFeuille(contenu, {titre: 'Catégories'});
}

function editerCategorie(categorie) {
  let icone = categorie?.icone ?? ICONES_CATEGORIE[0];
  const nom = el('input', {class: 'champ', id: 'categorie-nom', value: categorie?.nom ?? '', autocomplete: 'off'});
  const budget = categorie ? null : champMontant({id: 'categorie-budget', etiquette: 'Budget mensuel', valeur: 0, vide: 'zero'});
  const icones = ICONES_CATEGORIE.includes(icone) ? ICONES_CATEGORIE : [icone, ...ICONES_CATEGORIE];
  const message = el('p', {class: 'message-erreur', 'aria-live': 'polite'});
  const bouton = el('button', {class: 'btn-primaire', type: 'submit'}, categorie ? 'Enregistrer' : 'Créer la catégorie');
  const moisId = moisModifiable();
  let feuille;
  const form = el('form', {class: 'formulaire', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const texte = nom.value.trim();
    if (!texte) { message.textContent = 'Donne un nom à la catégorie'; return; }
    const doublon = etat.donnees.categories.some((c) => c.id !== categorie?.id && c.nom.toLowerCase() === texte.toLowerCase());
    if (doublon) { message.textContent = 'Une catégorie porte déjà ce nom'; return; }
    const b = budget?.valider();
    if (b && !b.ok) return;
    const ordre = Math.max(0, ...etat.donnees.categories.map((c) => c.ordre)) + 1;
    executer({bouton, message, feuille, succes: categorie ? 'Catégorie modifiée' : 'Catégorie créée',
      action: () => (categorie ? modifierCategorie(categorie.id, {nom: texte, icone})
                               : creerCategorie(etat.foyer.id, moisId, {nom: texte, icone, budget: b.valeur, ordre}))});
  }},
  el('div', {}, el('label', {class: 'etiquette', for: 'categorie-nom'}, 'Nom'), nom),
  el('div', {}, el('span', {class: 'etiquette'}, 'Icône'), grilleIcones(icones, icone, (i) => { icone = i; })),
  budget?.element,
  categorie ? el('p', {class: 'attenue', style: {margin: 0}}, 'Le budget se modifie dans la liste des budgets par catégorie.') : null,
  message, bouton,
  categorie ? el('button', {class: categorie.active ? 'btn-danger' : 'btn-secondaire', type: 'button', onclick: (e) => {
    if (categorie.active && !confirm(`Désactiver « ${categorie.nom} » ? Ses dépenses passées restent visibles.`)) return;
    executer({bouton: e.currentTarget, message, feuille,
      succes: categorie.active ? 'Catégorie désactivée' : 'Catégorie réactivée',
      action: () => activerCategorie(etat.foyer.id, moisId, categorie, !categorie.active)});
  }}, categorie.active ? 'Désactiver' : 'Réactiver') : null);
  feuille = ouvrirFeuille(form, {titre: categorie ? 'Modifier la catégorie' : 'Nouvelle catégorie'});
  nom.focus();
}

// ── Profil ─────────────────────────────────────────────────────────────

export function ouvrirProfil() {
  const moi = etat.moi;
  const prenom = el('input', {class: 'champ', id: 'profil-prenom', value: moi.prenom, autocomplete: 'given-name'});
  const salaire = champMontant({id: 'profil-salaire', etiquette: 'Salaire habituel', valeur: moi.salaire_defaut});
  const message = el('p', {class: 'message-erreur', 'aria-live': 'polite'});
  const bouton = el('button', {class: 'btn-primaire', type: 'submit'}, 'Enregistrer');
  let feuille;
  const form = el('form', {class: 'formulaire', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const s = salaire.valider();
    if (!prenom.value.trim()) { message.textContent = 'Indique ton prénom'; return; }
    if (!s.ok) return;
    executer({bouton, message, feuille, succes: 'Profil enregistré',
      action: () => modifierProfil(moi.id, {prenom: prenom.value.trim(), salaire_defaut: s.valeur})});
  }},
  el('div', {}, el('label', {class: 'etiquette', for: 'profil-prenom'}, 'Prénom'), prenom),
  salaire.element,
  el('p', {class: 'attenue', style: {margin: 0}}, 'Proposé à l\'ouverture d\'un mois quand aucun mois précédent ne sert de modèle.'),
  message, bouton);
  feuille = ouvrirFeuille(form, {titre: 'Mon profil'});
}
