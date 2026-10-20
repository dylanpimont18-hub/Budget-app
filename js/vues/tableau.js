// Onglet Budget (tableau de bord) : synthèse du mois, budgets par catégorie, graphiques.
import {modifierBudget} from '../db.js';
import {etat, recharger} from '../etat.js';
import {formatEUR, syntheseMois, niveauBudget, depensesParCategorie, totalParMembre, topPostes} from '../calc.js';
import {el, ouvrirFeuille, toast, champMontant} from '../ui.js';
import {selecteurMois} from './depenses.js';
import {copier} from './connexion.js';
import {seDeconnecter} from '../app.js';

const COULEURS = ['#B5552F', '#2563A8', '#D49A2A', '#7A3A8E', '#5E8C31'];
const GRIS_AUTRES = '#A89C90';
const SVG = 'http://www.w3.org/2000/svg';

const pct = (x, total) => (total > 0 ? (x / total) * 100 : 0);
const formatPct = (x) => `${x.toLocaleString('fr-FR', {maximumFractionDigits: 1})} %`;

export function rendreTableau(conteneur) {
  const d = etat.donnees;
  conteneur.append(selecteurMois());
  if (!d.mois) {
    conteneur.append(el('p', {class: 'vide-liste'}, 'Ce mois n\'a pas été ouvert.'), piedDePage());
    return;
  }

  const synthese = syntheseMois({
    salaires: d.membresMois.map((m) => m.salaire),
    revenus: d.revenus.map((r) => r.montant),
    recurrentes: d.recurrentes.map((r) => r.montant),
    budgets: d.budgets.map((b) => b.montant),
    versements: d.versements.map((v) => v.montant),
  });

  conteneur.append(
    cartes(synthese),
    el('h2', {}, 'Budgets par catégorie'),
    categories(),
    el('h2', {}, 'Par personne'),
    blocMembres(),
    el('h2', {}, 'Répartition'),
    graphiques(synthese),
    piedDePage());
}

// ── Cartes de synthèse ─────────────────────────────────────────────────

function cartes(s) {
  const carte = (etiquette, valeur) => el('div', {class: 'carte-stat'},
    el('div', {class: 'etiquette-stat'}, etiquette),
    el('div', {class: 'valeur-stat montant'}, formatEUR(valeur)),
    el('div', {class: 'sous-stat'}, s.revenus > 0 ? `${formatPct(pct(valeur, s.revenus))} des revenus` : '—'));

  let sousTexte;
  if (s.revenus <= 0) sousTexte = 'Renseignez vos revenus';
  else if (s.resteLibre < 0) sousTexte = '⚠ Vous dépensez plus que vos revenus';
  else sousTexte = `${formatPct(s.pctResteLibre)} de vos revenus`;

  return el('div', {class: 'grille-stats'},
    el('div', {class: `carte-stat large ${s.resteLibre < 0 ? 'negatif' : 'positif'}`},
      el('div', {class: 'etiquette-stat'}, 'Reste libre'),
      el('div', {class: 'valeur-stat montant'}, formatEUR(s.resteLibre)),
      el('div', {class: 'sous-stat'}, sousTexte)),
    el('div', {class: 'carte-stat'},
      el('div', {class: 'etiquette-stat'}, 'Revenus'),
      el('div', {class: 'valeur-stat montant'}, formatEUR(s.revenus)),
      el('div', {class: 'sous-stat'}, s.revenus > 0 ? '100 %' : '—')),
    carte('Charges fixes', s.chargesFixes),
    carte('Budgets', s.budgets),
    carte('Objectifs', s.objectifs));
}

// ── Catégories ─────────────────────────────────────────────────────────

function categories() {
  const d = etat.donnees;
  const modifiable = etat.moisCle === etat.moisCourantCle;
  const depenses = depensesParCategorie(d.depenses);
  const budgetDe = (id) => Number(d.budgets.find((b) => b.categorie_id === id)?.montant ?? 0);

  const lignes = d.categories
    .filter((c) => d.budgets.some((b) => b.categorie_id === c.id) || depenses.has(c.id))
    .map((c) => ({c, budget: budgetDe(c.id), depense: depenses.get(c.id)?.total ?? 0, parMembre: depenses.get(c.id)?.parMembre ?? {}}));
  const suivies = lignes.filter((l) => l.budget > 0 || l.depense > 0);
  const aZero = lignes.filter((l) => l.budget === 0 && l.depense === 0);

  const ligne = ({c, budget, depense, parMembre}) => {
    const niveau = niveauBudget(budget, depense);
    const largeur = budget > 0 ? Math.min(100, (depense / budget) * 100) : (depense > 0 ? 100 : 0);
    const detail = etat.membres
      .filter((m) => parMembre[m.id])
      .map((m) => `${m.prenom} ${formatEUR(parMembre[m.id])}`)
      .join(' · ');
    const libelleBudget = `${formatEUR(depense)} / ${formatEUR(budget)}`;
    return el('li', {class: 'ligne', style: {display: 'block'}},
      el('div', {style: {display: 'flex', alignItems: 'center', gap: '8px'}},
        el('span', {'aria-hidden': 'true'}, c.icone ?? '•'),
        el('span', {class: 'ligne-texte ligne-titre'}, c.nom),
        modifiable
          ? el('button', {class: 'btn-texte montant', type: 'button', style: {padding: '4px 6px'},
              'aria-label': `Modifier le budget ${c.nom} (${formatEUR(budget)})`, onclick: () => editerBudget(c, budget)},
            libelleBudget)
          : el('span', {class: 'montant attenue'}, libelleBudget)),
      el('div', {class: `jauge niveau-${niveau}`, role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(budget),
        'aria-valuenow': String(depense), 'aria-label': `${c.nom} : ${libelleBudget}`},
      el('span', {style: {width: `${largeur}%`}})),
      el('div', {style: {display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '0.8rem'}},
        el('span', {class: 'attenue'}, detail || 'Aucune dépense'),
        el('span', {class: `montant niveau-texte-${niveau}`}, `Reste ${formatEUR(budget - depense, {signe: true})}`)));
  };

  return el('div', {},
    suivies.length ? el('ul', {class: 'liste'}, suivies.map(ligne)) : el('p', {class: 'vide-liste'}, 'Aucun budget ce mois-ci.'),
    aZero.length
      ? el('details', {class: 'repliable'},
          el('summary', {}, `Catégories sans budget (${aZero.length})`),
          el('ul', {class: 'liste'}, aZero.map(ligne)))
      : null);
}

function editerBudget(categorie, actuel) {
  const champ = champMontant({id: 'budget-montant', etiquette: `Budget mensuel · ${categorie.nom}`, valeur: actuel});
  const message = el('p', {class: 'message-erreur', 'aria-live': 'polite'});
  const bouton = el('button', {class: 'btn-primaire', type: 'submit'}, 'Enregistrer');
  let feuille;
  const form = el('form', {class: 'formulaire', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const r = champ.valider();
    if (!r.ok) return;
    bouton.disabled = true;
    try {
      await modifierBudget(etat.foyer.id, etat.donnees.mois.id, categorie.id, r.valeur);
      feuille.fermer();
      toast('Budget modifié');
      await recharger();
    } catch (err) {
      message.textContent = err.message;
      bouton.disabled = false;
    }
  }},
  champ.element,
  el('p', {class: 'attenue', style: {margin: 0}}, 'S\'applique à ce mois et aux mois suivants.'),
  message, bouton);
  feuille = ouvrirFeuille(form, {titre: 'Modifier le budget'});
  champ.input.focus();
}

// ── Par personne ───────────────────────────────────────────────────────

function blocMembres() {
  const d = etat.donnees;
  const depenses = totalParMembre(d.depenses);
  return el('div', {class: 'grille-stats'}, etat.membres.map((m) => {
    const mm = d.membresMois.find((x) => x.membre_id === m.id);
    return el('div', {class: 'carte-stat'},
      el('div', {class: 'etiquette-stat'}, m.prenom),
      el('div', {class: 'valeur-stat montant'}, formatEUR(depenses[m.id] ?? 0)),
      el('div', {class: 'sous-stat'}, 'dépensé ce mois'),
      el('div', {class: 'sous-stat', style: {marginTop: '6px'}}, `Salaire ${formatEUR(Number(mm?.salaire ?? 0))}`),
      el('div', {class: 'sous-stat'}, mm?.solde == null ? 'Solde de départ : —' : `Solde de départ ${formatEUR(Number(mm.solde))} (info)`));
  }));
}

// ── Graphiques ─────────────────────────────────────────────────────────

function graphiques(s) {
  const d = etat.donnees;
  const postes = topPostes([
    ...d.recurrentes.map((r) => ({nom: r.libelle, montant: Number(r.montant)})),
    ...d.budgets.map((b) => ({
      nom: d.categories.find((c) => c.id === b.categorie_id)?.nom ?? 'Catégorie',
      montant: Number(b.montant),
    })),
  ]);
  const totalPostes = postes.reduce((t, p) => t + p.montant, 0);
  const couleur = (p, i) => (p.nom === 'Autres' && i === postes.length - 1 ? GRIS_AUTRES : COULEURS[i % COULEURS.length]);

  const segments = [
    {nom: 'Charges fixes', montant: s.chargesFixes, couleur: COULEURS[0]},
    {nom: 'Budgets', montant: s.budgets, couleur: COULEURS[2]},
    {nom: 'Objectifs', montant: Math.max(0, s.objectifs), couleur: COULEURS[1]},
    {nom: 'Reste libre', montant: Math.max(0, s.resteLibre), couleur: COULEURS[4]},
  ];
  const totalBarre = segments.reduce((t, x) => t + x.montant, 0);

  return el('div', {},
    el('div', {class: 'carte'},
      el('h3', {}, 'Dépenses prévues'),
      totalPostes > 0
        ? el('div', {class: 'camembert-zone'},
            anneau(postes.map((p, i) => ({valeur: p.montant, couleur: couleur(p, i)})),
              `Dépenses prévues : ${postes.map((p) => `${p.nom} ${formatPct(pct(p.montant, totalPostes))}`).join(', ')}`),
            el('ul', {class: 'legende'}, postes.map((p, i) => el('li', {},
              el('span', {class: 'puce', style: {background: couleur(p, i)}}),
              el('span', {class: 'nom'}, p.nom),
              el('span', {class: 'montant'}, formatPct(pct(p.montant, totalPostes)))))))
        : el('p', {class: 'attenue'}, 'Rien de prévu ce mois-ci.')),
    el('div', {class: 'carte'},
      el('h3', {}, 'Répartition des revenus'),
      el('div', {class: 'barre-repartition', role: 'img',
        'aria-label': segments.map((x) => `${x.nom} ${formatEUR(x.montant)}`).join(', ')},
      segments.filter((x) => x.montant > 0).map((x) =>
        el('span', {style: {width: `${pct(x.montant, totalBarre)}%`, background: x.couleur}, title: x.nom}))),
      el('ul', {class: 'legende'}, segments.map((x) => el('li', {},
        el('span', {class: 'puce', style: {background: x.couleur}}),
        el('span', {class: 'nom'}, x.nom),
        el('span', {class: 'montant'}, formatEUR(x.montant)))))));
}

// Anneau SVG : un cercle par part, décalé avec stroke-dashoffset
function anneau(parts, description) {
  const total = parts.reduce((t, p) => t + p.valeur, 0);
  const rayon = 15.9155; // circonférence de 100
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 42 42');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', description);
  let cumul = 0;
  for (const p of parts) {
    const part = (p.valeur / total) * 100;
    const cercle = document.createElementNS(SVG, 'circle');
    Object.entries({cx: 21, cy: 21, r: rayon, fill: 'none', stroke: p.couleur, 'stroke-width': 7,
      'stroke-dasharray': `${part} ${100 - part}`, 'stroke-dashoffset': String(25 - cumul)})
      .forEach(([k, v]) => cercle.setAttribute(k, v));
    svg.append(cercle);
    cumul += part;
  }
  return svg;
}

// ── Pied de page ───────────────────────────────────────────────────────

function piedDePage() {
  const code = etat.foyer?.code_invitation ?? '';
  return el('div', {class: 'carte', style: {marginTop: '16px'}},
    el('div', {style: {display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px'}},
      el('div', {},
        el('div', {class: 'attenue'}, 'Code d\'invitation du foyer'),
        el('strong', {style: {letterSpacing: '0.15em', fontSize: '1.2rem'}}, code)),
      el('button', {class: 'btn-texte', type: 'button', onclick: () => copier(code)}, 'Copier')),
    el('button', {class: 'btn-texte', type: 'button', onclick: seDeconnecter, style: {paddingLeft: 0}}, 'Se déconnecter'));
}
