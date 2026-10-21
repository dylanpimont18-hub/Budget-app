// Rapport d'une période : assemblage des chiffres (calc.js) et export en Markdown ou JSON.
// Pur, sans DOM ni réseau : l'onglet Rapports et les fichiers exportés partagent exactement les mêmes données.
import {formatEUR, libelleMois, decalerMois, nbMois, suiviObjectif, evolutionCategories, entreesSorties, epargneParMois,
  progressionObjectif, raisonsBaisse, projectionObjectif} from './calc.js';

const STATUTS = {avance: 'en avance', ajour: 'à jour', retard: 'en retard', atteint: 'atteint', echu: 'échu'};
const DEFINITIONS = {
  depenses: 'Dépenses par catégorie : dépenses ponctuelles du mois, hors charges fixes.',
  hausse: 'Hausse : plus de 15 % et de 20 € au-dessus de la moyenne de la période.',
  entrees: 'Entrées : salaires et autres revenus du mois.',
  sorties: 'Sorties : charges fixes et dépenses ponctuelles réelles du mois ; « estimé » si une charge variable reste à confirmer.',
  prevuAuDepart: 'Prévu au départ : effort mensuel initial (cible ÷ nombre de mois) des objectifs en cours ce mois-là.',
  pctObjectif: '% de l\'objectif : versé du mois ÷ cible.',
  pourquoi: 'Pourquoi : rempli quand le % baisse par rapport au mois ouvert précédent ; jusqu\'à 3 écarts défavorables d\'au moins 20 €.',
  projection: 'Projection : au rythme moyen des 3 derniers mois terminés (un mois sans versement compte pour 0 €).',
};

export const formatPct = (x) => `${x.toLocaleString('fr-FR', {maximumFractionDigits: 1})} %`;
const nomMois = (cle) => libelleMois(cle).split(' ')[0];
const clesEntre = (debut, fin) => Array.from({length: nbMois(debut, fin)}, (_, i) => decalerMois(debut, i));

// « avril → octobre 2026 », « décembre 2026 → mars 2027 », « octobre 2026 »
export function libellePeriode(debut, fin) {
  if (debut === fin) return libelleMois(fin);
  const depart = debut.slice(0, 4) === fin.slice(0, 4) ? nomMois(debut) : libelleMois(debut);
  return `${depart} → ${libelleMois(fin)}`;
}

// En-tête de colonne : « oct. », ou « oct. 26 » si la période couvre deux années
export function libelleCourt(cle, cles) {
  const memeAnnee = cles[0].slice(0, 4) === cles.at(-1).slice(0, 4);
  const court = new Intl.DateTimeFormat('fr-FR', memeAnnee ? {month: 'short'} : {month: 'short', year: '2-digit'});
  const [a, m] = cle.split('-').map(Number);
  return court.format(new Date(a, m - 1, 1));
}

export const statutObjectif = (suivi) => (suivi.statut !== 'atteint' && suivi.echu ? 'echu' : suivi.statut);

// parMois : résultat de db.chargerPlage (mois ouverts de la période et mois de référence).
// Le premier mois de la période se compare au mois ouvert qui le précède (référence, hors affichage).
export function construireRapport({debut, fin, parMois, reference, categories, objectifs, versementsTous, membres, moisCourant}) {
  const cles = clesEntre(debut, fin);
  const ouverts = cles.filter((c) => parMois[c]);
  const evolution = evolutionCategories(cles.map((cle) => ({
    cle, ouvert: Boolean(parMois[cle]), depenses: parMois[cle]?.depenses ?? [], recurrentes: parMois[cle]?.recurrentes ?? [],
  })), categories);

  const epargne = epargneParMois(ouverts.flatMap((c) => parMois[c].versements), objectifs, ouverts);
  epargne.objectifsVerses = objectifs.filter((o) => epargne.mois.some((m) => m.parObjectif[o.id] != null));

  const clesProgression = reference && parMois[reference] ? [reference, ...ouverts] : ouverts;
  const versementsPlage = clesProgression.flatMap((c) => parMois[c].versements);
  const bloc = (o) => {
    const tous = versementsTous.filter((v) => v.objectif_id === o.id);
    const progression = progressionObjectif(o, versementsPlage, clesProgression, moisCourant);
    const mois = cles.map((cle) => {
      if (!parMois[cle]) return {cle, ouvert: false};
      const i = clesProgression.indexOf(cle);
      const p = progression[i];
      const raisons = p.baisse ? raisonsBaisse(parMois[cle], parMois[clesProgression[i - 1]], categories, membres) : [];
      return {...p, ouvert: true, ...entreesSorties(parMois[cle]), raisons};
    });
    return {objectif: o, suivi: suiviObjectif({...o, cible: Number(o.cible)}, tous, moisCourant), mois,
      projection: projectionObjectif(o, tous, moisCourant)};
  };
  const recoupe = (o) => o.debut <= fin && o.fin >= debut;
  return {
    debut, fin, cles, ouverts, evolution, epargne,
    objectifs: objectifs.filter((o) => !o.archive && recoupe(o)).map(bloc),
    archives: objectifs.filter((o) => o.archive && recoupe(o)).map(bloc),
  };
}

// Phrases de la projection d'un objectif (la première porte le verdict)
export function texteProjection(objectif, p) {
  const echeance = libelleMois(objectif.fin);
  const lignes = [];
  if (p.statut === 'atteint') lignes.push('Atteint ✓');
  else if (p.statut === 'sans') lignes.push('Pas encore de mois terminé depuis le début de l\'objectif : pas de projection.');
  else if (p.statut === 'non_atteint') lignes.push('À ce rythme, l\'objectif n\'est pas atteint.');
  else {
    lignes.push(`À ce rythme (${formatEUR(p.rythme)}/mois) : atteint en ${libelleMois(p.moisAtteinte)} (prévu : ${echeance})`
      + (p.enAvance ? ' — en avance' : ''));
  }
  if (p.statut !== 'atteint') {
    if (p.echu) lignes.push(`L'échéance (${echeance}) est passée.`);
    else if (p.effortNecessaire > 0) lignes.push(`Il faudrait ${formatEUR(p.effortNecessaire)}/mois pour tenir ${echeance}.`);
  }
  return lignes;
}

const formatJour = new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'});
const nomIcone = (x) => `${x.icone ?? ''} ${x.nom}`.trim();
const dateIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pourquoi = (m) => {
  if (m.enCours) return 'mois en cours';
  return m.raisons.length ? m.raisons.join(' · ') : '—';
};

// ── Markdown (à coller dans une IA, ou à lire) ─────────────────────────

const cellule = (t) => String(t).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const ligneMd = (cellules) => `| ${cellules.map(cellule).join(' | ')} |`.replace(/ {2,}\|/g, ' |');
const tableMd = (entetes, alignements, lignes) => [ligneMd(entetes), `| ${alignements.join(' | ')} |`, ...lignes.map(ligneMd)];

export function rapportEnMarkdown(r, {genereLe = new Date()} = {}) {
  const enTete = r.cles.map((c) => libelleCourt(c, r.cles));
  const droite = r.cles.map(() => '---:');
  const nonOuverts = r.cles.filter((c) => !r.ouverts.includes(c));
  const serie = (s) => [...s.valeurs.map((v, i) => (v == null ? 'non ouvert' : formatEUR(v) + (s.hausses[i] ? ' ↑' : ''))),
    s.moyenne == null ? '—' : formatEUR(s.moyenne)];
  const duMois = (cle) => r.epargne.mois.find((m) => m.cle === cle);

  const md = [
    `# Rapport · ${libellePeriode(r.debut, r.fin)}`, '',
    `Généré le ${formatJour.format(genereLe)} depuis Budget familial. Montants en euros.`
      + (nonOuverts.length ? ` Mois non ouverts : ${nonOuverts.map(libelleMois).join(', ')}.` : ''), '',
    '## Évolution des dépenses ponctuelles par catégorie', '',
    ...tableMd(['Catégorie', ...enTete, 'Moyenne'], ['---', ...droite, '---:'], [
      ...r.evolution.lignes.map((l) => [nomIcone(l.categorie) + (l.categorie.active ? '' : ' (désactivée)'), ...serie(l)]),
      ['Charges fixes', ...serie(r.evolution.chargesFixes)]]),
    '', '↑ : plus de 15 % et de 20 € au-dessus de la moyenne de la période.', '',
    '## Épargne réellement versée', '',
    `Total versé sur la période : ${formatEUR(r.epargne.totalVerse)} · prévu au départ : ${formatEUR(r.epargne.totalPrevu)}`, '',
    ...tableMd(['Objectif', ...enTete, 'Total'], ['---', ...droite, '---:'], [
      ...r.epargne.objectifsVerses.map((o) => [nomIcone(o),
        ...r.cles.map((c) => (!duMois(c) ? 'non ouvert' : (duMois(c).parObjectif[o.id] == null ? '—' : formatEUR(duMois(c).parObjectif[o.id])))),
        formatEUR(r.epargne.mois.reduce((t, m) => t + (m.parObjectif[o.id] ?? 0), 0))]),
      ['Total versé', ...r.cles.map((c) => (duMois(c) ? formatEUR(duMois(c).verse) : 'non ouvert')), formatEUR(r.epargne.totalVerse)],
      ['Prévu au départ', ...r.cles.map((c) => (duMois(c) ? formatEUR(duMois(c).prevu) : '')), formatEUR(r.epargne.totalPrevu)]]),
  ];

  const blocMd = (b, archive) => {
    const o = b.objectif;
    return ['', `## Objectif${archive ? ' archivé' : ''} : ${nomIcone(o)}`, '',
      `Cible ${formatEUR(Number(o.cible))} · de ${libelleMois(o.debut)} à ${libelleMois(o.fin)} · `
        + `${formatEUR(b.suivi.verse)} versés (${formatPct(b.suivi.pct)}) · ${STATUTS[statutObjectif(b.suivi)]}`, '',
      ...tableMd(['Mois', 'Versé', '% de l\'objectif', 'Entrées', 'Sorties', 'Pourquoi'], ['---', '---:', '---:', '---:', '---:', '---'],
        b.mois.map((m) => (!m.ouvert ? [libelleMois(m.cle), 'non ouvert', '', '', '', '']
          : [libelleMois(m.cle), formatEUR(m.verse), formatPct(m.pct), formatEUR(m.entrees),
              formatEUR(m.sorties) + (m.estime ? ' (estimé)' : ''), pourquoi(m)]))),
      '', 'Projection :', ...texteProjection(o, b.projection).map((t) => `- ${t}`)];
  };
  md.push(...r.objectifs.flatMap((b) => blocMd(b, false)), ...r.archives.flatMap((b) => blocMd(b, true)));
  md.push('', '## Définitions', '', ...Object.values(DEFINITIONS).map((t) => `- ${t}`), '');
  return md.join('\n');
}

// ── JSON (données brutes, montants en euros) ───────────────────────────

export function rapportEnJson(r, {genereLe = new Date()} = {}) {
  const parMois = (valeurs) => Object.fromEntries(r.cles.map((c, i) => [c, valeurs[i]]));
  const serie = (s) => ({parMois: parMois(s.valeurs), moyenne: s.moyenne, moisEnHausse: r.cles.filter((_, i) => s.hausses[i])});
  const nomObjectif = (id) => r.epargne.objectifsVerses.find((o) => o.id === id)?.nom ?? id;
  const bloc = (b) => ({
    nom: b.objectif.nom,
    cible: Number(b.objectif.cible),
    debut: b.objectif.debut,
    fin: b.objectif.fin,
    archive: Boolean(b.objectif.archive),
    verseTotal: b.suivi.verse,
    pctTotal: b.suivi.pct,
    statut: STATUTS[statutObjectif(b.suivi)],
    mois: b.mois.map((m) => (!m.ouvert ? {mois: m.cle, ouvert: false} : {
      mois: m.cle, ouvert: true, verse: m.verse, pctObjectif: m.pct, entrees: m.entrees, sorties: m.sorties,
      sortiesEstimees: m.estime, moisEnCours: m.enCours, pourquoi: m.raisons,
    })),
    projection: {
      statut: b.projection.statut,
      rythmeMensuel: b.projection.rythme,
      moisAtteinte: b.projection.moisAtteinte,
      enAvance: b.projection.enAvance,
      effortNecessaireParMois: b.projection.effortNecessaire,
      texte: texteProjection(b.objectif, b.projection),
    },
  });
  return {
    rapport: 'Budget familial',
    genereLe: dateIso(genereLe),
    periode: {debut: r.debut, fin: r.fin, libelle: libellePeriode(r.debut, r.fin),
      moisNonOuverts: r.cles.filter((c) => !r.ouverts.includes(c))},
    definitions: DEFINITIONS,
    depensesParCategorie: r.evolution.lignes.map((l) => ({categorie: l.categorie.nom, active: Boolean(l.categorie.active), ...serie(l)})),
    chargesFixes: serie(r.evolution.chargesFixes),
    epargne: {
      totalVerse: r.epargne.totalVerse,
      totalPrevuAuDepart: r.epargne.totalPrevu,
      parMois: r.epargne.mois.map((m) => ({mois: m.cle, verse: m.verse, prevuAuDepart: m.prevu,
        parObjectif: Object.fromEntries(Object.entries(m.parObjectif).map(([id, v]) => [nomObjectif(id), v]))})),
    },
    objectifs: [...r.objectifs, ...r.archives].map(bloc),
  };
}
