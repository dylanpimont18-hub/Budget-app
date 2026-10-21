// Onglet Rapports (ordinateur seulement) : lecture « document » d'une période, de haut en bas, imprimable.
// Charge sa propre plage de mois (db.chargerPlage), sans toucher au mois affiché par les autres onglets.
// Tous les chiffres viennent de calc.js, qui reprend les calculs des onglets Budget et Objectifs.
import {chargerPlage} from '../db.js';
import {etat, surTempsReel} from '../etat.js';
import {formatEUR, libelleMois, decalerMois, nbMois, suiviObjectif, evolutionCategories, entreesSorties, epargneParMois,
  progressionObjectif, raisonsBaisse, projectionObjectif} from '../calc.js';
import {el, toast} from '../ui.js';
import {COULEURS, GRIS_AUTRES} from './tableau.js';

const SVG = 'http://www.w3.org/2000/svg';
const COULEUR_VERSE = COULEURS[4];
const COULEUR_DEPENSES = COULEURS[0];
const formatJour = new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'});
const formatPct = (x) => `${x.toLocaleString('fr-FR', {maximumFractionDigits: 1})} %`;
const nomMois = (cle) => libelleMois(cle).split(' ')[0];
const dateImpression = () => `Imprimé le ${formatJour.format(new Date())}`;

// Le rapport a pu être affiché la veille : la date est celle de l'impression
globalThis.addEventListener?.('beforeprint', () => {
  for (const n of document.querySelectorAll('.date-impression')) n.textContent = dateImpression();
});

// Période choisie (conservée en changeant d'onglet) : 'six' derniers mois, 'annee' en cours ou 'plage' de … à …
let periode = {type: 'six'};
let charge = null;          // {debut, fin, parMois, reference}
let erreur = null;
let generation = 0;
let actif = false;
let conteneurVue = null;
let desabonner = null;
let minuteur = null;
let categorieChoisie = null;   // id de catégorie, ou 'charges' pour les charges fixes

function bornes() {
  const fin = etat.moisCourantCle;
  if (periode.type === 'annee') return {debut: `${fin.slice(0, 4)}-01`, fin};
  if (periode.type === 'plage') return {debut: periode.debut, fin: periode.fin};
  return {debut: decalerMois(fin, -5), fin};
}

const clesEntre = (debut, fin) => Array.from({length: nbMois(debut, fin)}, (_, i) => decalerMois(debut, i));

export function rendreRapports(conteneur) {
  const ouverture = !actif;
  actif = true;
  conteneurVue = conteneur;
  // Temps réel : on recharge la plage (anti-rebond) tant que l'onglet est affiché
  desabonner ??= surTempsReel(() => {
    clearTimeout(minuteur);
    minuteur = setTimeout(charger, 300);
  });
  const {debut, fin} = bornes();
  if (ouverture || charge?.debut !== debut || charge?.fin !== fin) charger();
  dessiner(conteneur);
}

// Les données sont oubliées en sortant : à la réouverture (ou pour un autre compte après déconnexion),
// rien de périmé n'est affiché
export function quitterRapports() {
  actif = false;
  charge = null;
  erreur = null;
  generation += 1;   // un chargement en cours sera ignoré
  clearTimeout(minuteur);
  desabonner?.();
  desabonner = null;
}

// Si un chargement plus récent a été lancé entre-temps (autre période, temps réel), ce résultat périmé est ignoré
async function charger() {
  const {debut, fin} = bornes();
  const numero = ++generation;
  try {
    const resultat = await chargerPlage(etat.foyer.id, debut, fin);
    if (numero !== generation) return;
    charge = {debut, fin, ...resultat};
    erreur = null;
  } catch (e) {
    if (numero !== generation) return;
    erreur = e.message;
    toast(e.message, {type: 'erreur'});
  }
  if (actif) redessiner();
}

function redessiner() {
  conteneurVue.replaceChildren();
  dessiner(conteneurVue);
}

function changerPeriode(nouvelle) {
  periode = nouvelle;
  erreur = null;   // l'erreur concernait l'ancienne période
  charger();
  redessiner();
}

// ── Document ───────────────────────────────────────────────────────────

function dessiner(conteneur) {
  const {debut, fin} = bornes();
  conteneur.append(entete(debut, fin));

  if (!etat.donnees.moisDisponibles.length) {
    conteneur.append(el('p', {class: 'vide-liste'}, 'Aucun mois n\'a encore été ouvert : le rapport sera disponible ensuite.'));
    return;
  }
  if (charge?.debut !== debut || charge?.fin !== fin) {
    conteneur.append(erreur
      ? el('div', {class: 'vide-liste'}, el('p', {class: 'message-erreur'}, erreur),
          el('button', {class: 'btn-secondaire', type: 'button', style: {width: 'auto'}, onclick: () => { erreur = null; charger(); redessiner(); }},
            'Réessayer'))
      : el('p', {class: 'chargement'}, 'Chargement du rapport…'));
    return;
  }

  const cles = clesEntre(debut, fin);
  const ouverts = cles.filter((c) => charge.parMois[c]);
  if (!ouverts.length) {
    conteneur.append(el('p', {class: 'vide-liste'}, 'Aucun mois ouvert sur cette période.'));
    return;
  }

  const objectifs = etat.donnees.objectifs;
  const recoupe = (o) => o.debut <= fin && o.fin >= debut;
  const enCours = objectifs.filter((o) => !o.archive && recoupe(o));
  const archives = objectifs.filter((o) => o.archive && recoupe(o));

  conteneur.append(
    sectionEvolution(cles),
    sectionEpargne(cles, ouverts),
    ...enCours.map((o) => blocObjectif(o, cles, ouverts)),
    archives.length
      ? el('details', {class: 'repliable archives-rapport'},
          el('summary', {}, `Objectifs archivés (${archives.length})`),
          archives.map((o) => blocObjectif(o, cles, ouverts)))
      : null);
}

function titre(debut, fin) {
  if (debut === fin) return `Rapport · ${libelleMois(fin)}`;
  const depart = debut.slice(0, 4) === fin.slice(0, 4) ? nomMois(debut) : libelleMois(debut);
  return `Rapport · ${depart} → ${libelleMois(fin)}`;
}

function entete(debut, fin) {
  return el('header', {class: 'entete-rapport'},
    el('div', {},
      el('h1', {}, titre(debut, fin)),
      el('p', {class: 'attenue date-impression'}, dateImpression())),
    el('div', {class: 'outils-rapport'},
      selecteurPeriode(debut, fin),
      el('button', {class: 'btn-secondaire', type: 'button', onclick: () => window.print()}, '🖨 Imprimer')));
}

function selecteurPeriode(debut, fin) {
  const bouton = (type, texte, valeur) => el('button', {type: 'button', 'aria-pressed': String(periode.type === type),
    onclick: () => changerPeriode(valeur())}, texte);
  const segment = el('div', {class: 'segment', role: 'group', 'aria-label': 'Période'},
    bouton('six', '6 derniers mois', () => ({type: 'six'})),
    bouton('annee', 'Année en cours', () => ({type: 'annee'})),
    bouton('plage', 'De … à …', () => ({type: 'plage', debut, fin})));
  if (periode.type !== 'plage') return el('div', {class: 'selecteur-periode'}, segment);

  // Mois ouverts, du plus ancien au plus récent ; les bornes actuelles restent choisissables
  const disponibles = [...new Set([...etat.donnees.moisDisponibles, debut, fin])].sort();
  const liste = (id, etiquette, valeur, changer) => el('label', {class: 'choix-mois', for: id},
    el('span', {class: 'etiquette'}, etiquette),
    el('select', {class: 'champ', id, onchange: (e) => changer(e.target.value)},
      disponibles.map((cle) => el('option', {value: cle, selected: cle === valeur}, libelleMois(cle)))));
  const ranger = (a, b) => (a <= b ? {type: 'plage', debut: a, fin: b} : {type: 'plage', debut: b, fin: a});
  return el('div', {class: 'selecteur-periode'}, segment,
    el('div', {class: 'rangee'},
      liste('rapport-debut', 'De', debut, (v) => changerPeriode(ranger(v, fin))),
      liste('rapport-fin', 'À', fin, (v) => changerPeriode(ranger(debut, v)))));
}

const libelleColonne = (cle, cles) => {
  const memeAnnee = cles[0].slice(0, 4) === cles.at(-1).slice(0, 4);
  const court = new Intl.DateTimeFormat('fr-FR', memeAnnee ? {month: 'short'} : {month: 'short', year: '2-digit'});
  const [a, m] = cle.split('-').map(Number);
  return court.format(new Date(a, m - 1, 1));
};

const nonOuvert = () => el('span', {class: 'non-ouvert'}, 'non ouvert');

// ── Évolution des dépenses ─────────────────────────────────────────────

function sectionEvolution(cles) {
  const evo = evolutionCategories(cles.map((cle) => ({
    cle, ouvert: Boolean(charge.parMois[cle]),
    depenses: charge.parMois[cle]?.depenses ?? [], recurrentes: charge.parMois[cle]?.recurrentes ?? [],
  })), etat.donnees.categories);

  // Courses par défaut, sinon la catégorie la plus dépensée sur la période
  const total = (l) => l.valeurs.reduce((t, v) => t + (v ?? 0), 0);
  if (categorieChoisie !== 'charges' && !evo.lignes.some((l) => l.categorie.id === categorieChoisie)) {
    categorieChoisie = (evo.lignes.find((l) => l.categorie.nom === 'Courses')
      ?? [...evo.lignes].sort((a, b) => total(b) - total(a))[0])?.categorie.id ?? 'charges';
  }
  const choisie = categorieChoisie === 'charges'
    ? {nom: 'Charges fixes', serie: evo.chargesFixes}
    : (() => {
        const l = evo.lignes.find((x) => x.categorie.id === categorieChoisie);
        return {nom: `${l.categorie.icone ?? ''} ${l.categorie.nom}`.trim(), serie: l};
      })();

  const section = el('section', {class: 'carte section-rapport'});
  const choisir = (id) => {
    categorieChoisie = id;
    section.replaceWith(sectionEvolution(cles));
  };
  const ligne = (id, nom, serie, classe = '') => el('tr', {
    class: `ligne-choix ${classe} ${id === categorieChoisie ? 'choisie' : ''}`, tabindex: '0', 'aria-current': id === categorieChoisie ? 'true' : null,
    onclick: () => choisir(id), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choisir(id); } }},
  el('th', {scope: 'row'}, nom),
  serie.valeurs.map((v, i) => el('td', {class: `montant ${serie.hausses[i] ? 'hausse' : ''}`,
    title: serie.hausses[i] ? 'Nettement au-dessus de la moyenne' : null}, v == null ? nonOuvert() : formatEUR(v))),
  el('td', {class: 'montant moyenne'}, serie.moyenne == null ? '—' : formatEUR(serie.moyenne)));

  section.append(
    el('h2', {}, 'Évolution des dépenses'),
    el('p', {class: 'attenue'}, 'Dépenses ponctuelles par catégorie. En orange : plus de 15 % et de 20 € au-dessus de la moyenne.',
      el('span', {class: 'ecran-seulement'}, ' Clique sur une ligne pour la voir en graphique.')),
    el('div', {class: 'defilement-x'},
      el('table', {class: 'tableau-rapport'},
        el('thead', {}, el('tr', {},
          el('th', {scope: 'col'}, 'Catégorie'),
          cles.map((c) => el('th', {scope: 'col', class: 'montant'}, libelleColonne(c, cles))),
          el('th', {scope: 'col', class: 'montant'}, 'Moyenne'))),
        el('tbody', {},
          evo.lignes.map((l) => ligne(l.categorie.id, `${l.categorie.icone ?? ''} ${l.categorie.nom}`.trim(), l,
            l.categorie.active ? '' : 'inactive')),
          ligne('charges', 'Charges fixes', evo.chargesFixes, 'ligne-total')))),
    el('h3', {class: 'titre-graphique'}, choisie.nom),
    graphiqueBarres(cles.map((c, i) => ({libelle: libelleColonne(c, cles), valeurs: [choisie.serie.valeurs[i]]})),
      [{nom: choisie.nom, couleur: categorieChoisie === 'charges' ? COULEURS[1] : COULEUR_DEPENSES}],
      `${choisie.nom} par mois : ${cles.map((c, i) => `${libelleMois(c)} ${choisie.serie.valeurs[i] == null
        ? 'non ouvert' : formatEUR(choisie.serie.valeurs[i])}`).join(', ')}`));
  return section;
}

// ── Épargne réellement versée ──────────────────────────────────────────

function sectionEpargne(cles, ouverts) {
  const objectifs = etat.donnees.objectifs;
  const versements = ouverts.flatMap((c) => charge.parMois[c].versements);
  const ep = epargneParMois(versements, objectifs, ouverts);
  const duMois = (cle) => ep.mois.find((m) => m.cle === cle);
  const concernes = objectifs.filter((o) => ep.mois.some((m) => m.parObjectif[o.id] != null));

  const series = [{nom: 'Versé', couleur: COULEUR_VERSE}, {nom: 'Prévu au départ', couleur: GRIS_AUTRES}];
  return el('section', {class: 'carte section-rapport'},
    el('h2', {}, 'Épargne réellement versée'),
    el('p', {class: 'resume-rapport'},
      'Total versé sur la période : ', el('strong', {class: 'montant'}, formatEUR(ep.totalVerse)),
      ' · prévu au départ : ', el('strong', {class: 'montant'}, formatEUR(ep.totalPrevu))),
    el('p', {class: 'attenue'}, '« Prévu au départ » : effort mensuel initial (cible ÷ nombre de mois) des objectifs en cours ce mois-là.'),
    graphiqueBarres(cles.map((c) => ({libelle: libelleColonne(c, cles),
      valeurs: duMois(c) ? [duMois(c).verse, duMois(c).prevu] : [null, null]})), series,
    `Épargne par mois : ${cles.map((c) => (duMois(c)
      ? `${libelleMois(c)} versé ${formatEUR(duMois(c).verse)}, prévu ${formatEUR(duMois(c).prevu)}`
      : `${libelleMois(c)} non ouvert`)).join(', ')}`),
    legende(series),
    el('div', {class: 'defilement-x'},
      el('table', {class: 'tableau-rapport'},
        el('thead', {}, el('tr', {},
          el('th', {scope: 'col'}, 'Objectif'),
          cles.map((c) => el('th', {scope: 'col', class: 'montant'}, libelleColonne(c, cles))),
          el('th', {scope: 'col', class: 'montant'}, 'Total'))),
        el('tbody', {},
          concernes.map((o) => el('tr', {},
            el('th', {scope: 'row'}, `${o.icone ?? '🎯'} ${o.nom}`),
            cles.map((c) => el('td', {class: 'montant'}, !duMois(c) ? nonOuvert()
              : (duMois(c).parObjectif[o.id] == null ? '—' : formatEUR(duMois(c).parObjectif[o.id])))),
            el('td', {class: 'montant'}, formatEUR(ep.mois.reduce((t, m) => t + (m.parObjectif[o.id] ?? 0), 0))))),
          el('tr', {class: 'ligne-total'},
            el('th', {scope: 'row'}, 'Total versé'),
            cles.map((c) => el('td', {class: 'montant'}, duMois(c) ? formatEUR(duMois(c).verse) : nonOuvert())),
            el('td', {class: 'montant'}, formatEUR(ep.totalVerse))),
          el('tr', {class: 'ligne-prevu'},
            el('th', {scope: 'row'}, 'Prévu au départ'),
            cles.map((c) => el('td', {class: 'montant'}, duMois(c) ? formatEUR(duMois(c).prevu) : '')),
            el('td', {class: 'montant'}, formatEUR(ep.totalPrevu)))))));
}

// ── Un bloc par objectif ───────────────────────────────────────────────

function blocObjectif(o, cles, ouverts) {
  const cible = Number(o.cible);
  const tousVersements = etat.donnees.versementsTous.filter((v) => v.objectif_id === o.id);
  const s = suiviObjectif({...o, cible}, tousVersements, etat.moisCourantCle);   // mêmes chiffres que l'onglet Objectifs

  // Le premier mois de la période se compare au mois ouvert qui le précède (chargé en plus, hors affichage)
  const clesProgression = charge.reference ? [charge.reference, ...ouverts] : ouverts;
  const versementsPlage = clesProgression.flatMap((c) => charge.parMois[c].versements);
  const progression = progressionObjectif(o, versementsPlage, clesProgression, etat.moisCourantCle);

  const ligneMois = (cle) => {
    const donnees = charge.parMois[cle];
    if (!donnees) {
      return el('tr', {class: 'mois-non-ouvert'}, el('th', {scope: 'row'}, libelleMois(cle)),
        el('td', {colspan: '5'}, nonOuvert()));
    }
    const i = clesProgression.indexOf(cle);
    const p = progression[i];
    const es = entreesSorties(donnees);
    const raisons = p.baisse
      ? raisonsBaisse(donnees, charge.parMois[clesProgression[i - 1]], etat.donnees.categories, etat.membres)
      : [];
    return el('tr', {},
      el('th', {scope: 'row'}, libelleMois(cle)),
      el('td', {class: 'montant'}, formatEUR(p.verse)),
      el('td', {class: `montant ${p.baisse ? 'baisse' : ''}`}, formatPct(p.pct)),
      el('td', {class: 'montant'}, formatEUR(es.entrees)),
      el('td', {class: 'montant'}, formatEUR(es.sorties),
        es.estime ? el('span', {class: 'estime', title: 'Une charge variable est encore à confirmer'}, ' estimé') : null),
      el('td', {class: 'pourquoi'}, p.enCours ? el('span', {class: 'non-ouvert'}, 'mois en cours')
        : (raisons.length ? raisons.map((r, j) => [j ? ' · ' : null, el('span', {class: 'raison'}, r)]) : '—')));
  };

  return el('section', {class: 'carte section-rapport bloc-objectif'},
    el('div', {class: 'objectif-entete'},
      el('span', {class: 'ligne-icone', 'aria-hidden': 'true'}, o.icone ?? '🎯'),
      el('h2', {class: 'ligne-texte', style: {margin: 0}}, o.nom),
      el('span', {class: 'attenue'}, `Cible ${formatEUR(cible)} · échéance ${libelleMois(o.fin)}`)),
    el('div', {class: 'jauge niveau-ok', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(cible),
      'aria-valuenow': String(s.verse), 'aria-label': `${o.nom} : ${formatEUR(s.verse)} sur ${formatEUR(cible)}`},
    el('span', {style: {width: `${Math.max(0, Math.min(100, s.pct))}%`}})),
    el('div', {class: 'objectif-chiffres'},
      el('span', {class: 'montant'}, `${formatEUR(s.verse)} versés sur ${formatEUR(cible)} (${formatPct(s.pct)})`),
      el('span', {}, `${libelleMois(o.debut)} → ${libelleMois(o.fin)}`)),
    el('div', {class: 'defilement-x'},
      el('table', {class: 'tableau-rapport tableau-objectif'},
        el('thead', {}, el('tr', {},
          el('th', {scope: 'col'}, 'Mois'),
          el('th', {scope: 'col', class: 'montant'}, 'Versé'),
          el('th', {scope: 'col', class: 'montant'}, '% de l\'objectif'),
          el('th', {scope: 'col', class: 'montant'}, 'Entrées'),
          el('th', {scope: 'col', class: 'montant'}, 'Sorties'),
          el('th', {scope: 'col'}, 'Pourquoi'))),
        el('tbody', {}, cles.map(ligneMois)))),
    projection(o, tousVersements));
}

function projection(o, versements) {
  const p = projectionObjectif(o, versements, etat.moisCourantCle);
  const echeance = libelleMois(o.fin);
  const lignes = [];
  if (p.statut === 'atteint') lignes.push(el('strong', {class: 'niveau-texte-ok'}, 'Atteint ✓'));
  else if (p.statut === 'sans') lignes.push('Pas encore de mois terminé depuis le début de l\'objectif : pas de projection.');
  else if (p.statut === 'non_atteint') lignes.push(el('strong', {class: 'niveau-texte-depasse'}, 'À ce rythme, l\'objectif n\'est pas atteint.'));
  else {
    lignes.push(el('span', {},
      `À ce rythme (${formatEUR(p.rythme)}/mois) : atteint en ${libelleMois(p.moisAtteinte)} (prévu : ${echeance})`,
      p.enAvance ? el('strong', {class: 'niveau-texte-ok'}, ' — en avance') : null));
  }
  if (p.statut !== 'atteint') {
    if (p.echu) lignes.push(`L'échéance (${echeance}) est passée.`);
    else if (p.effortNecessaire > 0) lignes.push(`Il faudrait ${formatEUR(p.effortNecessaire)}/mois pour tenir ${echeance}.`);
  }
  return el('div', {class: 'projection'}, lignes.map((l) => el('p', {}, l)));
}

// ── Graphiques ─────────────────────────────────────────────────────────

function legende(series) {
  return el('ul', {class: 'legende legende-ligne'}, series.map((s) => el('li', {},
    el('span', {class: 'puce', style: {background: s.couleur}}), el('span', {}, s.nom))));
}

// Barres groupées : groupes = [{libelle, valeurs: (number|null)[]}], une valeur par série ; null = mois non ouvert
function graphiqueBarres(groupes, series, description) {
  const largeur = 720;
  const hauteur = 210;
  const haut = 22;
  const bas = 28;
  const zone = hauteur - haut - bas;
  const bande = largeur / groupes.length;
  const max = Math.max(1, ...groupes.flatMap((g) => g.valeurs.filter((v) => v != null)));
  const barre = Math.min(56, (bande * 0.7) / series.length);

  const noeud = (tag, attrs, texte) => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (texte != null) n.textContent = texte;
    return n;
  };
  const svg = noeud('svg', {viewBox: `0 0 ${largeur} ${hauteur}`, role: 'img', 'aria-label': description});
  svg.append(noeud('line', {x1: 0, x2: largeur, y1: haut + zone, y2: haut + zone, stroke: GRIS_AUTRES, 'stroke-width': 1}));
  groupes.forEach((g, i) => {
    const centre = bande * i + bande / 2;
    const depart = centre - (barre * series.length) / 2;
    g.valeurs.forEach((v, j) => {
      const x = depart + j * barre;
      if (v == null) return;
      const h = (Math.max(0, v) / max) * zone;
      svg.append(noeud('rect', {x: x + 2, y: haut + zone - h, width: barre - 4, height: h, rx: 3, fill: series[j].couleur}));
      svg.append(noeud('text', {x: x + barre / 2, y: haut + zone - h - 6, 'text-anchor': 'middle', 'font-size': 11,
        fill: 'currentColor'}, formatEUR(v, {entier: true})));
    });
    if (g.valeurs.every((v) => v == null)) {
      svg.append(noeud('text', {x: centre, y: haut + zone - 8, 'text-anchor': 'middle', 'font-size': 11, fill: GRIS_AUTRES},
        'non ouvert'));
    }
    svg.append(noeud('text', {x: centre, y: hauteur - 8, 'text-anchor': 'middle', 'font-size': 12, fill: 'currentColor'}, g.libelle));
  });
  return el('div', {class: 'graphique-barres'}, svg);
}
