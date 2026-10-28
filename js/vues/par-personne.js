// « Par personne » (onglet Dépenses) : une colonne par membre, de son solde à ce qui lui reste.
// Les charges communes passent par le compte joint (chacun y vire sa part) ; un revenu commun est partagé de même.
// Les budgets non encore dépensés restent au niveau du foyer : ils sortiront de la colonne de qui paiera.
import {etat, estMoisCourant} from '../etat.js';
import {formatEUR, colonnesMembres, bilanMois, virementCommun} from '../calc.js';
import {el} from '../ui.js';
import {editerPart} from './part-membre.js';

const formatJour = new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'short'});
const libelleDate = (iso) => {
  const [a, m, j] = iso.split('-').map(Number);
  return formatJour.format(new Date(a, m - 1, j));
};

// Sorties dans l'ordre de la barre ; chaque teinte est un jeton de style.css
// Détail à l'euro près : deux colonnes tiennent à 375 px ; le reste garde ses centimes
const euros = (n) => formatEUR(n, {entier: true});

const SORTIES = [
  ['communes', 'Communes'],
  ['chargesPerso', 'Perso'],
  ['depensesPayees', 'Dépenses'],
  ['objectifs', 'Objectifs'],
];

export function blocParPersonne() {
  const d = etat.donnees;
  const ids = etat.membres.map((m) => m.id);
  const colonnes = colonnesMembres({membres: d.membresMois, ids, revenus: d.revenus, recurrentes: d.recurrentes,
    depenses: d.depenses, versements: d.versements, depensesAvant: d.depensesAvant});
  const b = bilanMois({budgets: d.budgets, depenses: d.depenses});
  const budgetsRestants = Math.max(0, b.prevu - b.depense);

  return el('section', {class: 'par-personne'},
    carteCompteCommun(virementCommun({ids, recurrentes: d.recurrentes, revenus: d.revenus})),
    el('div', {class: 'grille-personnes'}, etat.membres.map((m, i) =>
      cartePersonne(m, i, colonnes.find((c) => c.membre_id === m.id), d.membresMois.find((x) => x.membre_id === m.id)))),
    el('p', {class: 'note-personnes'},
      'Communes : la part de chacun des charges communes pas encore prélevées (un revenu commun est partagé de même).',
      budgetsRestants > 0 && estMoisCourant()
        ? ` Encore ${formatEUR(budgetsRestants)} de budgets à dépenser : ils sortiront de la colonne de qui paie.`
        : ''));
}

// Ce que chacun vire sur le compte commun ce mois-ci
function carteCompteCommun(v) {
  if (!v.charges && !v.revenus) return null;
  const n = etat.membres.length;
  const ligne = (libelle, texte, classe = '') => el('li', {class: classe},
    el('span', {class: 'detail-libelle'}, libelle), el('span', {class: 'montant'}, texte));
  return el('div', {class: 'carte-commun'},
    el('div', {class: 'commun-entete'},
      el('span', {class: 'commun-icone', 'aria-hidden': 'true'}, '🏦'),
      el('span', {class: 'commun-titre'}, n > 1 ? 'À virer chacun sur le compte commun' : 'À virer sur le compte commun'),
      el('span', {class: 'commun-montant montant'}, formatEUR(v.parPersonne))),
    el('ul', {class: 'detail-personne commun-detail'},
      ligne('Charges communes', formatEUR(v.charges)),
      v.revenus ? ligne('Revenus communs (CAF…)', `−${formatEUR(v.revenus)}`) : null,
      n > 1 ? ligne(`Total ÷ ${n}`, `${formatEUR(Math.max(0, v.total))} ÷ ${n}`, 'commun-total') : null),
    v.total < 0 ? el('p', {class: 'personne-sous', style: {margin: '6px 0 0'}},
      `Les revenus communs couvrent les charges : ${formatEUR(-v.total)} de plus sur le compte commun.`) : null);
}

function cartePersonne(m, rang, c, mm) {
  const entete = el('div', {class: 'personne-entete'},
    el('span', {class: `avatar avatar-${rang % 2}`, 'aria-hidden': 'true'}, m.prenom.slice(0, 1).toUpperCase()),
    el('span', {class: 'personne-nom'}, m.prenom));
  // Modifiable aussi dans un mois passé (correction)
  const attributs = {class: 'carte-personne', type: 'button', onclick: () => editerPart(m, mm)};

  if (!c.renseigne) {
    return el('button', {...attributs, class: 'carte-personne a-remplir', 'aria-label': `Remplir la part de ${m.prenom}`},
      entete,
      el('p', {class: 'personne-vide'}, 'Solde du mois pas encore saisi'),
      el('span', {class: 'personne-action'}, 'Remplir ›'));
  }

  const entrees = (c.solde ?? 0) - c.depensesDepuisSolde + c.salaireARecevoir + c.revenusARecevoir;
  const sorties = SORTIES.filter(([cle]) => c[cle] > 0);
  const echelle = Math.max(entrees, entrees - c.reste, 1);
  const segment = (cle, valeur) => el('span', {class: `teinte-${cle}`, style: {width: `${(valeur / echelle) * 100}%`}});

  const detail = (libelle, valeur, signe, cle) => el('li', {},
    el('span', {class: `puce-statut teinte-${cle}`, 'aria-hidden': 'true'}),
    el('span', {class: 'detail-libelle'}, libelle),
    el('span', {class: 'montant'}, `${signe}${euros(valeur)}`));

  return el('button', {...attributs, class: `carte-personne${c.reste < 0 ? ' en-negatif' : ''}`,
    'aria-label': `${m.prenom} : reste ${formatEUR(c.reste)}, modifier son solde`},
  entete,
  el('div', {class: `personne-reste montant niveau-texte-${c.reste < 0 ? 'depasse' : 'ok'}`}, formatEUR(c.reste)),
  el('div', {class: 'personne-sous'}, c.solde != null && mm?.solde_le ? `reste · solde du ${libelleDate(mm.solde_le)}` : 'reste'),
  el('div', {class: 'barre-personne', role: 'img', 'aria-label': [
    ...sorties.map(([cle, libelle]) => `${libelle} ${formatEUR(c[cle])}`), `reste ${formatEUR(c.reste)}`].join(', ')},
  sorties.map(([cle]) => segment(cle, c[cle])),
  c.reste > 0 ? segment('reste', c.reste) : null),
  el('ul', {class: 'detail-personne'},
    el('li', {class: 'detail-entree'}, el('span', {class: 'detail-libelle'}, c.solde == null ? 'Solde ?' : 'Solde'),
      el('span', {class: 'montant'}, euros(c.solde ?? 0))),
    c.salaireARecevoir ? el('li', {class: 'detail-entree'}, el('span', {class: 'detail-libelle'}, 'Salaire'),
      el('span', {class: 'montant'}, `+${euros(c.salaireARecevoir)}`)) : null,
    c.revenusARecevoir ? el('li', {class: 'detail-entree'}, el('span', {class: 'detail-libelle'}, 'Revenus'),
      el('span', {class: 'montant'}, `+${euros(c.revenusARecevoir)}`)) : null,
    c.depensesDepuisSolde ? el('li', {class: 'detail-entree'}, el('span', {class: 'detail-libelle'}, 'Avant le 1er'),
      el('span', {class: 'montant'}, `−${euros(c.depensesDepuisSolde)}`)) : null),
  sorties.length ? el('ul', {class: 'detail-personne sorties'}, sorties.map(([cle, libelle]) => detail(libelle, c[cle], '−', cle))) : null);
}
