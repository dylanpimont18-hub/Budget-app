import test from 'node:test';
import assert from 'node:assert/strict';
import {construireRapport, rapportEnMarkdown, rapportEnJson, texteProjection} from '../js/rapport.js';

// Août → octobre 2026, septembre non ouvert, juillet = mois de référence ; nous sommes en octobre.
const CATEGORIES = [
  {id: 'c', nom: 'Courses', icone: '🛒', ordre: 1, active: true},
  {id: 'l', nom: 'Loisirs | sorties', icone: '🎉', ordre: 2, active: true},
];
const MEMBRES = [{id: 'D', prenom: 'Dylan'}, {id: 'A', prenom: 'Amel'}];
const OBJECTIFS = [
  {id: 'v', nom: 'Vacances', icone: '🏖️', cible: 2000, debut: '2026-01', fin: '2027-06', archive: false},
  {id: 'z', nom: 'Vélo', icone: '🚲', cible: 500, debut: '2026-01', fin: '2026-06', archive: true},    // hors période
  {id: 'w', nom: 'Ancien', icone: '🎯', cible: 300, debut: '2026-08', fin: '2026-12', archive: true},
];
const mois = (cle, {courses, primes, verse, aConfirmer = false}) => ({
  cle, mois: {id: 'm' + cle, cle},
  membresMois: [{membre_id: 'D', salaire: 1800}, {membre_id: 'A', salaire: 2100}],
  revenus: [{libelle: 'CAF', montant: 100}, ...(primes ? [{libelle: 'Primes', montant: primes}] : [])],
  recurrentes: [{recurrente_id: 'r1', libelle: 'Loyer', montant: 900},
    {recurrente_id: 'r3', libelle: 'Nourrice', montant: 400, a_confirmer: aConfirmer}],
  depenses: [{categorie_id: 'c', montant: courses}, {categorie_id: 'l', montant: 50}],
  versements: [{objectif_id: 'v', mois_cle: cle, montant: verse}],
});
const PAR_MOIS = {
  '2026-07': mois('2026-07', {courses: 600, primes: 200, verse: 200}),
  '2026-08': mois('2026-08', {courses: 750, primes: 0, verse: 100}),
  '2026-10': mois('2026-10', {courses: 300, primes: 0, verse: 50, aConfirmer: true}),
};
const VERSEMENTS_TOUS = [
  ...['01', '02', '03', '04', '05', '06'].map((m) => ({objectif_id: 'v', mois_cle: `2026-${m}`, montant: 100})),
  ...Object.values(PAR_MOIS).flatMap((m) => m.versements),
];
const RAPPORT = construireRapport({debut: '2026-08', fin: '2026-10', parMois: PAR_MOIS, reference: '2026-07',
  categories: CATEGORIES, objectifs: OBJECTIFS, versementsTous: VERSEMENTS_TOUS, membres: MEMBRES, moisCourant: '2026-10'});
const LE_21_OCTOBRE = new Date(2026, 9, 21);

test('construireRapport : mois ouverts, objectifs de la période, pourquoi par rapport au mois de référence', () => {
  assert.deepEqual(RAPPORT.cles, ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(RAPPORT.ouverts, ['2026-08', '2026-10']);
  assert.deepEqual(RAPPORT.objectifs.map((b) => b.objectif.id), ['v']);
  assert.deepEqual(RAPPORT.archives.map((b) => b.objectif.id), ['w']);
  const [aout, septembre, octobre] = RAPPORT.objectifs[0].mois;
  assert.deepEqual(aout, {cle: '2026-08', ouvert: true, verse: 100, pct: 5, baisse: true, enCours: false,
    entrees: 4000, sorties: 2100, salaires: 3900, revenus: 100, charges: 1300, depenses: 800, estime: false,
    raisons: ['pas de Primes', 'Courses +150 €']});
  assert.deepEqual(septembre, {cle: '2026-09', ouvert: false});
  assert.equal(octobre.enCours, true);
  assert.equal(octobre.estime, true);
  assert.deepEqual(octobre.raisons, []);
  assert.deepEqual(RAPPORT.epargne.objectifsVerses.map((o) => o.id), ['v']);
  assert.equal(RAPPORT.objectifs[0].suivi.verse, 950);
});

test('texteProjection : rythme, échéance et effort nécessaire en clair', () => {
  const b = RAPPORT.objectifs[0];
  // 950 € versés, 100 €/mois (juillet 200, août 100, septembre 0) à partir de novembre : 11 mois → septembre 2027
  assert.deepEqual(texteProjection(b.objectif, b.projection), [
    'À ce rythme (100,00 €/mois) : atteint en septembre 2027 (prévu : juin 2027)',
    'Il faudrait 131,25 €/mois pour tenir juin 2027.',
  ]);
});

test('rapportEnMarkdown : tableaux lisibles par une IA, barres verticales échappées', () => {
  const md = rapportEnMarkdown(RAPPORT, {genereLe: LE_21_OCTOBRE});
  const lignes = md.split('\n');
  assert.equal(lignes[0], '# Rapport · août → octobre 2026');
  assert.ok(md.includes('Généré le 21 octobre 2026'));
  assert.ok(md.includes('Mois non ouverts : septembre 2026.'));
  assert.ok(lignes.includes('| 🛒 Courses | 750,00 € ↑ | non ouvert | 300,00 € | 525,00 € |'));
  assert.ok(lignes.some((l) => l.startsWith('| 🎉 Loisirs \\| sorties |')));
  assert.ok(md.includes('Total versé sur la période : 150,00 € · prévu au départ : 222,22 €'));
  assert.ok(lignes.includes('## Objectif : 🏖️ Vacances'));
  assert.ok(lignes.includes('| août 2026 | 100,00 € | 5 % | 4 000,00 € | 2 100,00 € | pas de Primes · Courses +150 € |'));
  assert.ok(lignes.includes('| septembre 2026 | non ouvert | | | | |'));
  assert.ok(lignes.includes('| octobre 2026 | 50,00 € | 2,5 % | 4 000,00 € | 1 650,00 € (estimé) | mois en cours |'));
  assert.ok(md.includes('- À ce rythme (100,00 €/mois) : atteint en septembre 2027 (prévu : juin 2027)'));
  assert.ok(lignes.includes('## Objectif archivé : 🎯 Ancien'));
});

test('rapportEnJson : données brutes en euros, sérialisables', () => {
  const j = rapportEnJson(RAPPORT, {genereLe: LE_21_OCTOBRE});
  assert.deepEqual(JSON.parse(JSON.stringify(j)), j);
  assert.equal(j.genereLe, '2026-10-21');
  assert.deepEqual(j.periode, {debut: '2026-08', fin: '2026-10', libelle: 'août → octobre 2026', moisNonOuverts: ['2026-09']});
  assert.deepEqual(j.depensesParCategorie[0],
    {categorie: 'Courses', active: true, parMois: {'2026-08': 750, '2026-09': null, '2026-10': 300}, moyenne: 525, moisEnHausse: ['2026-08']});
  assert.deepEqual(j.chargesFixes.parMois, {'2026-08': 1300, '2026-09': null, '2026-10': 1300});
  assert.deepEqual(j.epargne.parMois[0], {mois: '2026-08', verse: 100, prevuAuDepart: 111.11, parObjectif: {Vacances: 100}});
  const vacances = j.objectifs[0];
  assert.equal(vacances.nom, 'Vacances');
  assert.equal(vacances.archive, false);
  assert.equal(vacances.verseTotal, 950);
  assert.deepEqual(vacances.mois[0], {mois: '2026-08', ouvert: true, verse: 100, pctObjectif: 5, entrees: 4000, sorties: 2100,
    sortiesEstimees: false, moisEnCours: false, pourquoi: ['pas de Primes', 'Courses +150 €']});
  assert.deepEqual(vacances.mois[1], {mois: '2026-09', ouvert: false});
  assert.equal(vacances.projection.moisAtteinte, '2027-09');
  assert.equal(j.objectifs[1].archive, true);
  assert.ok(typeof j.definitions.prevuAuDepart === 'string');
});
