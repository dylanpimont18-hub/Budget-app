// Onglet Budget (tableau de bord) : prévision du mois, budgets par catégorie, par personne, graphiques.
// Le solde de chacun est le point de départ : on n'ajoute ou ne retire que ce qui n'y est pas encore (calc.syntheseMois).
import {modifierBudget, modifierMoisMembre} from '../db.js';
import {etat, recharger} from '../etat.js';
import {formatEUR, libelleMois, syntheseMois, bilanMois, niveauBudget, depensesParCategorie, totalParMembre, topPostes} from '../calc.js';
import {el, ajouter, ouvrirFeuille, toast, champMontant} from '../ui.js';
import {selecteurMois, aujourdhui, categorieDe} from './depenses.js';
import {formulairePart, de} from './part-membre.js';
import {ouvrirRevenus, ouvrirCategories, ouvrirProfil} from './reglages.js';
import {ouvrirConfirmation} from './recurrentes.js';
import {copier} from './connexion.js';
import {seDeconnecter} from '../app.js';

// Teintes de bois et de forêt : noyer, ardoise, miel, prune, mousse
export const COULEURS = ['#6B4A35', '#4E6E85', '#C4923A', '#7D4E6B', '#5E7F4E'];
export const GRIS_AUTRES = '#B3AA9C';
const SVG = 'http://www.w3.org/2000/svg';

const pct = (x, total) => (total > 0 ? (x / total) * 100 : 0);
const formatPct = (x) => `${x.toLocaleString('fr-FR', {maximumFractionDigits: 1})} %`;
const formatJourCourt = new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'long'});
const libelleDate = (iso) => {
  const [a, m, j] = iso.split('-').map(Number);
  return formatJourCourt.format(new Date(a, m - 1, j));
};
const estMoisCourant = () => etat.moisCle === etat.moisCourantCle;

export function rendreTableau(conteneur) {
  const d = etat.donnees;
  if (d.mois && estMoisCourant()) ajouter(conteneur, bandeaux());
  conteneur.append(selecteurMois());
  if (!d.mois) {
    conteneur.append(el('p', {class: 'vide-liste'}, 'Ce mois n\'a pas été ouvert.'), piedDePage());
    return;
  }

  const synthese = syntheseMois({
    membres: d.membresMois,
    revenus: d.revenus,
    recurrentes: d.recurrentes,
    budgets: d.budgets,
    depenses: d.depenses,
    versements: d.versements,
  });

  // Mois passé : la prévision n'a plus de sens, on montre le bilan
  ajouter(conteneur, [
    estMoisCourant() ? cartes(synthese) : bilan(),
    el('h2', {}, 'Budgets par catégorie'),
    categories(),
    el('h2', {}, 'Par personne'),
    blocMembres(),
    el('h2', {}, 'Répartition'),
    graphiques(synthese, {prevision: estMoisCourant()}),
    piedDePage()]);
}

// ── Bandeaux (mois en cours) ───────────────────────────────────────────

function bandeaux() {
  const d = etat.donnees;
  const resultat = [];
  const mien = d.membresMois.find((mm) => mm.membre_id === etat.moi.id);
  if (mien && !mien.renseigne) {
    resultat.push(el('div', {class: 'bandeau-info', role: 'status'},
      el('span', {}, 'Remplis ta part du mois : salaire et solde'),
      el('button', {class: 'btn-primaire', type: 'button', onclick: () => editerMembre(etat.moi, mien)}, 'Remplir')));
  }
  // La part de l'autre peut aussi être remplie d'ici, si on connaît son salaire et son solde
  for (const mm of d.membresMois.filter((x) => x.membre_id !== etat.moi.id && !x.renseigne)) {
    const membre = etat.membres.find((m) => m.id === mm.membre_id);
    if (!membre) continue;
    resultat.push(el('div', {class: 'bandeau-info discret', role: 'status'},
      el('span', {}, `Part ${de(membre.prenom)} pas encore remplie`),
      el('button', {class: 'btn-secondaire', type: 'button', onclick: () => editerMembre(membre, mm)}, 'Remplir')));
  }
  for (const r of d.recurrentes.filter((x) => x.a_confirmer)) {
    resultat.push(el('div', {class: 'bandeau-info', role: 'status'},
      el('span', {}, `${r.icone ?? '📌'} Montant de ${r.libelle} ce mois-ci ?`),
      el('button', {class: 'btn-primaire', type: 'button', onclick: () => ouvrirConfirmation(r)}, 'Saisir')));
  }
  for (const mm of d.membresMois) {
    const membre = etat.membres.find((m) => m.id === mm.membre_id);
    if (!membre || !mm.renseigne || mm.salaire_recu || !(Number(mm.salaire) > 0)) continue;
    const mois = libelleMois(etat.moisCle).split(' ')[0];
    const titre = membre.id === etat.moi.id ? `Ton salaire de ${mois} est arrivé ?` : `Salaire de ${mois} ${de(membre.prenom)} reçu ?`;
    resultat.push(el('div', {class: 'bandeau-info', role: 'status'},
      el('span', {}, titre),
      el('button', {class: 'btn-primaire', type: 'button', onclick: () => confirmerSalaire(membre, mm)}, 'Oui, confirmer')));
  }
  return resultat;
}

// Seuls salaire et salaire_recu changent : le salaire reste compté à part du solde, une seule fois
function confirmerSalaire(membre, mm) {
  const champ = champMontant({id: 'salaire-recu', etiquette: 'Montant reçu', valeur: mm.salaire, grand: true});
  const message = el('p', {class: 'message-erreur', 'aria-live': 'polite'});
  const bouton = el('button', {class: 'btn-primaire', type: 'submit'}, 'Enregistrer');
  let feuille;
  const form = el('form', {class: 'formulaire', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const r = champ.valider();
    if (!r.ok) return;
    bouton.disabled = true;
    try {
      await modifierMoisMembre(etat.foyer.id, etat.donnees.mois.id, membre.id, {salaire: r.valeur, salaire_recu: true});
      feuille.fermer();
      toast('Salaire confirmé');
      await recharger();
    } catch (err) {
      message.textContent = err.message;
      bouton.disabled = false;
    }
  }},
  champ.element,
  el('p', {class: 'attenue', style: {margin: 0}}, "Corrige le montant s'il diffère du salaire attendu."),
  message, bouton);
  feuille = ouvrirFeuille(form, {titre: membre.id === etat.moi.id ? 'Ton salaire' : `Salaire de ${membre.prenom}`});
  champ.input.focus();
}

// ── Cartes de synthèse ─────────────────────────────────────────────────

function cartes(s) {
  const modifiable = estMoisCourant();
  const sousPct = (valeur) => (s.disponible > 0 ? `${formatPct(pct(valeur, s.disponible))} du disponible` : '—');
  const carte = (etiquette, valeur, sous) => el('div', {class: 'carte-stat'},
    el('div', {class: 'etiquette-stat'}, etiquette),
    el('div', {class: 'valeur-stat montant'}, formatEUR(valeur)),
    sous.map((t) => el('div', {class: 'sous-stat'}, t)));

  let sousTexte;
  if (s.disponible <= 0 && s.resteLibre >= 0) sousTexte = 'Renseigne les soldes et les salaires';
  else if (s.resteLibre < 0) sousTexte = '⚠ Le prévu dépasse ce qui est disponible';
  else sousTexte = `${formatPct(s.pctResteLibre)} du disponible · prévision de fin de mois`;

  // Tant qu'un membre n'a pas rempli sa part, son solde manque : la prévision est partielle
  const enAttente = etat.membres.filter((m) => !etat.donnees.membresMois.find((x) => x.membre_id === m.id)?.renseigne);
  if (enAttente.length && s.resteLibre >= 0) {
    sousTexte = `Prévision partielle : ${enAttente.map((m) => m.prenom).join(' et ')} n'a pas encore rempli sa part`;
  }

  const detail = (libelle, valeur) => el('div', {class: 'detail-stat'}, el('span', {}, libelle),
    el('span', {class: 'montant'}, formatEUR(valeur)));
  const disponible = [
    el('div', {class: 'etiquette-stat'}, 'Disponible'),
    el('div', {class: 'valeur-stat montant'}, formatEUR(s.disponible)),
    detail('Sur les comptes', s.comptes),
    detail('Salaires à recevoir', s.salairesARecevoir),
    detail('Autres revenus à recevoir', s.revenusARecevoir),
    modifiable ? el('div', {class: 'sous-stat lien-stat'}, 'Gérer les autres revenus ›') : null,
  ];

  const sousCharges = s.chargesAPrelever !== s.chargesFixes
    ? [`sur ${formatEUR(s.chargesFixes)}, le reste déjà prélevé`] : [sousPct(s.chargesAPrelever)];
  const sousBudgets = [];
  if (s.depensesDeduites > 0) sousBudgets.push(`${formatEUR(s.depensesDeduites)} déjà payés avant le solde`);
  if (s.budgetsPrevus > s.budgets) sousBudgets.push(`dont ${formatEUR(s.budgetsPrevus - s.budgets)} de dépassement`);
  if (!sousBudgets.length) sousBudgets.push(sousPct(s.budgetsAVenir));

  return el('div', {class: 'grille-stats'},
    el('div', {class: `carte-stat large ${s.resteLibre < 0 ? 'negatif' : 'positif'}`},
      el('div', {class: 'etiquette-stat'}, 'Reste libre'),
      el('div', {class: 'valeur-stat montant'}, formatEUR(s.resteLibre)),
      el('div', {class: 'sous-stat'}, sousTexte)),
    modifiable
      ? el('button', {class: 'carte-stat large', type: 'button', style: {textAlign: 'left', font: 'inherit'},
          'aria-label': `Disponible ${formatEUR(s.disponible)}, gérer les autres revenus`, onclick: ouvrirRevenus}, disponible)
      : el('div', {class: 'carte-stat large'}, disponible),
    carte('Charges à prélever', s.chargesAPrelever, sousCharges),
    carte('Budgets à venir', s.budgetsAVenir, sousBudgets),
    carte('Objectifs', s.objectifs, [sousPct(s.objectifs)]));
}

// ── Bilan d'un mois passé ──────────────────────────────────────────────

function bilan() {
  const d = etat.donnees;
  const b = bilanMois({budgets: d.budgets, depenses: d.depenses});
  const epargne = d.versements.reduce((t, v) => t + Number(v.montant), 0);
  return el('div', {class: 'carte'},
    el('h3', {}, 'Bilan du mois'),
    el('ul', {class: 'legende'},
      el('li', {}, el('span', {class: 'nom'}, 'Charges fixes'),
        el('span', {class: 'montant'}, formatEUR(d.recurrentes.reduce((t, r) => t + Number(r.montant), 0)))),
      el('li', {}, el('span', {class: 'nom'}, 'Budgets prévus'), el('span', {class: 'montant'}, formatEUR(b.prevu))),
      el('li', {}, el('span', {class: 'nom'}, 'Dépensé'), el('span', {class: 'montant'}, formatEUR(b.depense))),
      el('li', {}, el('span', {class: 'nom'}, b.ecart >= 0 ? 'Économisé sur les budgets' : 'Dépassement total'),
        el('span', {class: `montant ${b.ecart >= 0 ? 'niveau-texte-ok' : 'niveau-texte-depasse'}`},
          formatEUR(Math.abs(b.ecart)))),
      el('li', {}, el('span', {class: 'nom'}, 'Épargne versée'), el('span', {class: 'montant'}, formatEUR(epargne)))),
    b.depassements.length
      ? el('p', {class: 'attenue', style: {margin: '8px 0 0'}}, 'Dépassements : ' + b.depassements
          .map((x) => `${categorieDe(x.categorie_id).nom} +${formatEUR(x.ecart)}`).join(' · '))
      : el('p', {class: 'attenue', style: {margin: '8px 0 0'}}, 'Aucun budget dépassé 👏'));
}

// ── Catégories ─────────────────────────────────────────────────────────

function categories() {
  const d = etat.donnees;
  const modifiable = estMoisCourant();
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
        modifiable && c.active
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
      : null,
    modifiable ? el('button', {class: 'btn-texte', type: 'button', onclick: ouvrirCategories}, 'Gérer les catégories') : null);
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
  const modifiable = estMoisCourant();
  const depenses = totalParMembre(d.depenses);
  return el('div', {class: 'grille-stats'}, etat.membres.map((m) => {
    const mm = d.membresMois.find((x) => x.membre_id === m.id);
    const infos = !mm || !mm.renseigne
      ? [el('div', {class: 'sous-stat', style: {marginTop: '6px'}}, 'Part du mois à remplir')]
      : [
          el('div', {class: 'sous-stat', style: {marginTop: '6px'}},
            `Salaire ${mm.salaire_recu ? 'reçu' : 'attendu'} ${formatEUR(Number(mm.salaire))}`),
          el('div', {class: 'sous-stat'}, mm.solde == null
            ? 'Solde : non saisi'
            : `Solde ${formatEUR(Number(mm.solde))}${mm.solde_le ? ` au ${libelleDate(mm.solde_le)}` : ''}`),
        ];
    const perso = d.recurrentes.filter((r) => r.membre_id === m.id).reduce((t, r) => t + Number(r.montant), 0);
    if (perso > 0) infos.push(el('div', {class: 'sous-stat'}, `Charges perso ${formatEUR(perso)}`));
    const contenu = [
      el('div', {class: 'etiquette-stat'}, m.prenom),
      el('div', {class: 'valeur-stat montant'}, formatEUR(depenses[m.id] ?? 0)),
      el('div', {class: 'sous-stat'}, 'dépensé ce mois'),
      infos,
    ];
    return modifiable
      ? el('button', {class: 'carte-stat', type: 'button', style: {textAlign: 'left', font: 'inherit'},
          'aria-label': `Modifier salaire et solde de ${m.prenom}`, onclick: () => editerMembre(m, mm)}, contenu)
      : el('div', {class: 'carte-stat'}, contenu);
  }));
}

// Remplir sa part, celle de l'autre, ou corriger une réponse
function editerMembre(membre, mm) {
  const premiereFois = !mm?.renseigne;
  const part = formulairePart({membre, cle: etat.moisCle, premiereFois,
    valeurs: {salaire: mm?.salaire, solde: mm?.solde, salaire_dans_solde: mm?.salaire_dans_solde}});
  const message = el('p', {class: 'message-erreur', 'aria-live': 'polite'});
  const bouton = el('button', {class: 'btn-primaire', type: 'submit'}, 'Enregistrer');
  let feuille;
  const form = el('form', {class: 'formulaire', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    message.textContent = '';
    const r = part.valider();
    if (!r.ok) return;
    const {salaire, solde, salaire_dans_solde: oui} = r.valeurs;
    // Nouveau solde : sa date change, les dépenses d'avant y sont considérées comme déduites
    const soldeChange = premiereFois || solde !== (mm?.solde == null ? null : Number(mm.solde));
    const soldeLe = solde == null ? null : (soldeChange ? aujourdhui() : mm.solde_le);
    // Déjà dans le solde ⇒ reçu ; si l'on revient sur un « oui », le salaire redevient à confirmer
    const recu = oui || (mm?.salaire_dans_solde ? false : Boolean(mm?.salaire_recu));
    bouton.disabled = true;
    try {
      await modifierMoisMembre(etat.foyer.id, etat.donnees.mois.id, membre.id, {salaire, solde,
        solde_le: soldeLe, salaire_dans_solde: oui, salaire_recu: recu, renseigne: true});
      feuille.fermer();
      toast('Enregistré');
      await recharger();
    } catch (err) {
      message.textContent = err.message;
      bouton.disabled = false;
    }
  }},
  part.element,
  premiereFois ? null : el('p', {class: 'attenue', style: {margin: 0}},
    'Nouveau solde ? Les dépenses d\'avant aujourd\'hui y sont déjà déduites. '
    + 'Coche ensuite dans Récurrentes les charges déjà prélevées.'),
  message, bouton);
  feuille = ouvrirFeuille(form, {titre: membre.prenom});
}

// ── Graphiques ─────────────────────────────────────────────────────────

function graphiques(s, {prevision}) {
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
    {nom: 'Charges à prélever', montant: s.chargesAPrelever, couleur: COULEURS[0]},
    {nom: 'Budgets à venir', montant: s.budgetsAVenir, couleur: COULEURS[2]},
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
    prevision ? el('div', {class: 'carte'},
      el('h3', {}, 'Répartition du disponible'),
      el('div', {class: 'barre-repartition', role: 'img',
        'aria-label': segments.map((x) => `${x.nom} ${formatEUR(x.montant)}`).join(', ')},
      segments.filter((x) => x.montant > 0).map((x) =>
        el('span', {style: {width: `${pct(x.montant, totalBarre)}%`, background: x.couleur}, title: x.nom}))),
      el('ul', {class: 'legende'}, segments.map((x) => el('li', {},
        el('span', {class: 'puce', style: {background: x.couleur}}),
        el('span', {class: 'nom'}, x.nom),
        el('span', {class: 'montant'}, formatEUR(x.montant)))))) : null);
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
    el('div', {style: {display: 'flex', justifyContent: 'space-between', gap: '8px'}},
      el('button', {class: 'btn-texte', type: 'button', onclick: ouvrirProfil, style: {paddingLeft: 0}}, 'Mon profil'),
      el('button', {class: 'btn-texte', type: 'button', onclick: seDeconnecter}, 'Se déconnecter')));
}
