import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMontant, formatEUR, cleMois, decalerMois, nbMois, libelleMois, niveauBudget,
  syntheseMois, bilanMois, depensesParCategorie, totalParMembre, topPostes,
  effortMensuel, cibleDepuisMensuel, suiviObjectif, de,
  evolutionCategories, entreesSorties, epargneParMois, progressionObjectif, raisonsBaisse, projectionObjectif,
} from '../js/calc.js';

test('parseMontant accepte le clavier français', () => {
  assert.equal(parseMontant('12,50'), 12.5);
  assert.equal(parseMontant(' 1 234,5 '), 1234.5);
  assert.equal(parseMontant('1 234,56'), 1234.56);
  assert.equal(parseMontant(''), null);
  assert.equal(parseMontant('abc'), null);
  assert.equal(parseMontant('-20'), null);
  assert.equal(parseMontant('-20', {negatif: true}), -20);
  assert.equal(parseMontant('0'), 0);
});
test('formatEUR', () => {
  assert.equal(formatEUR(1234.5), '1 234,50 €');
  assert.equal(formatEUR(-3), '-3,00 €');
  assert.equal(formatEUR(5, {signe: true}), '+5,00 €');
});
test('mois', () => {
  assert.equal(cleMois(new Date(2026, 9, 31, 23, 30)), '2026-10');
  assert.equal(decalerMois('2026-12', 1), '2027-01');
  assert.equal(decalerMois('2026-01', -1), '2025-12');
  assert.equal(nbMois('2026-10', '2027-09'), 12);
  assert.equal(nbMois('2026-10', '2026-09'), 0);
  assert.equal(libelleMois('2026-10'), 'octobre 2026');
});
test('niveauBudget', () => {
  assert.equal(niveauBudget(0, 0), 'vide');
  assert.equal(niveauBudget(750, 100), 'ok');
  assert.equal(niveauBudget(750, 600), 'alerte');   // 80 % pile
  assert.equal(niveauBudget(750, 751), 'depasse');
  assert.equal(niveauBudget(0, 10), 'depasse');
});
test('syntheseMois sans solde : salaires + revenus − charges − budgets − objectifs', () => {
  const s = syntheseMois({membres: [{salaire: 1800, solde: null}, {salaire: 2100, solde: null}],
    revenus: [{montant: 100, dans_solde: true}], recurrentes: [{montant: 700, dans_solde: true}, {montant: 80.25}],
    budgets: [{categorie_id: 'c', montant: 750}, {categorie_id: 't', montant: 350}], versements: [{montant: 100}]});
  // sans solde, les cases « déjà passé sur le compte » sont ignorées
  assert.equal(s.disponible, 4000);
  assert.equal(s.chargesAPrelever, 780.25);
  assert.equal(s.budgetsAVenir, 1100);
  assert.equal(s.resteLibre, 2019.75);
  assert.equal(s.pctResteLibre, 50.49);
  assert.equal(syntheseMois({recurrentes: [{montant: 10}]}).pctResteLibre, null);
});
test("syntheseMois avec soldes : rien n'est compté deux fois", () => {
  const s = syntheseMois({
    membres: [
      {membre_id: 'D', salaire: 1800, solde: 1500, solde_le: '2026-10-04', salaire_dans_solde: true},
      {membre_id: 'A', salaire: 2100, solde: -100, solde_le: '2026-10-06', salaire_dans_solde: false},
    ],
    revenus: [{montant: 100, dans_solde: true}, {montant: 50, dans_solde: false}],
    recurrentes: [{montant: 700, dans_solde: true}, {montant: 80.25, dans_solde: false}],
    budgets: [{categorie_id: 'c', montant: 750}, {categorie_id: 't', montant: 350}],
    depenses: [
      {categorie_id: 'c', membre_id: 'D', montant: 40, date: '2026-10-03'},   // avant le solde de D : déjà déduite
      {categorie_id: 'c', membre_id: 'D', montant: 60, date: '2026-10-04'},   // le jour du solde : comptée
      {categorie_id: 't', membre_id: 'A', montant: 400, date: '2026-10-05'},  // budget dépassé, déjà déduite
      {categorie_id: 'x', membre_id: 'A', montant: 30, date: '2026-10-10'},   // sans budget : comptée
    ],
    versements: [{montant: 100}],
  });
  assert.equal(s.comptes, 1400);
  assert.equal(s.salairesARecevoir, 2100);
  assert.equal(s.revenusARecevoir, 50);
  assert.equal(s.disponible, 3550);
  assert.equal(s.chargesAPrelever, 80.25);
  assert.equal(s.budgetsPrevus, 1180);       // 750 + max(350, 400) + 30
  assert.equal(s.depensesDeduites, 440);
  assert.equal(s.budgetsAVenir, 740);
  assert.equal(s.resteLibre, 2629.75);       // 3550 − 80,25 − 740 − 100
});
test('bilanMois', () => {
  const b = bilanMois({budgets: [{categorie_id: 'c', montant: 750}, {categorie_id: 't', montant: 350}],
    depenses: [{categorie_id: 'c', montant: 800}, {categorie_id: 't', montant: 100}, {categorie_id: 'x', montant: 20}]});
  assert.equal(b.prevu, 1100);
  assert.equal(b.depense, 920);
  assert.equal(b.ecart, 180);
  assert.deepEqual(b.depassements.map((d) => [d.categorie_id, d.ecart]), [['c', 50], ['x', 20]]);
});
test('depensesParCategorie et totalParMembre', () => {
  const d = [{categorie_id: 'c', membre_id: 'D', montant: 10}, {categorie_id: 'c', membre_id: 'A', montant: 5.5},
             {categorie_id: 'x', membre_id: 'D', montant: 2}];
  assert.deepEqual(depensesParCategorie(d).get('c'), {total: 15.5, parMembre: {D: 10, A: 5.5}});
  assert.deepEqual(totalParMembre(d), {D: 12, A: 5.5});
});
test('topPostes', () => {
  const p = [1,2,3,4,5,6,7].map(i => ({nom: 'P' + i, montant: i})).concat({nom: 'Z', montant: 0});
  assert.deepEqual(topPostes(p).map(x => x.nom), ['P7','P6','P5','P4','P3','Autres']);
  assert.equal(topPostes(p).at(-1).montant, 3);
  assert.equal(topPostes(p.slice(0, 6)).length, 6);   // 6 postes : pas d'« Autres »
});
test('objectifs', () => {
  const o = {cible: 1200, debut: '2026-10', fin: '2027-09'};
  assert.equal(effortMensuel(1200, '2026-10', '2027-09'), 100);
  assert.equal(cibleDepuisMensuel(100, 12), 1200);
  assert.deepEqual(suiviObjectif(o, [{mois_cle: '2026-10', montant: 100}], '2026-10'),
    {verse: 100, pct: 8.33, prevu: 100, statut: 'ajour', moisRestants: 11, effortRecalcule: 100, echu: false});
  const r = suiviObjectif(o, [{mois_cle: '2026-10', montant: 100}], '2026-12');
  assert.equal(r.statut, 'retard'); assert.equal(r.prevu, 200);   // octobre et novembre ; décembre pas encore dû
  assert.equal(r.moisRestants, 10); assert.equal(r.effortRecalcule, 110);
  assert.equal(suiviObjectif(o, [{mois_cle: '2026-10', montant: 300}], '2026-11').statut, 'avance');
  const e = suiviObjectif(o, [{mois_cle: '2026-10', montant: 500}], '2028-01');
  assert.equal(e.echu, true); assert.equal(e.moisRestants, 0); assert.equal(e.effortRecalcule, 0);
  assert.equal(suiviObjectif(o, [{mois_cle: '2026-10', montant: 1200}], '2026-10').statut, 'atteint');
  const neuf = suiviObjectif(o, [], '2026-10');   // créé ce mois-ci, rien versé : pas en retard
  assert.equal(neuf.statut, 'ajour'); assert.equal(neuf.prevu, 0);
});

// ── Rapports ────────────────────────────────────────────────────────────

test('calc.js se charge sur un moteur Intl antérieur à ES2023 (ancien iPhone)', async () => {
  const Origine = Intl.NumberFormat;
  // Avant ES2023, maximumFractionDigits sous le minimum de la devise (2 pour l'euro) levait une RangeError
  Intl.NumberFormat = function (locale, options = {}) {
    if (options.style === 'currency' && options.maximumFractionDigits < 2 && options.minimumFractionDigits == null) {
      throw new RangeError('maximumFractionDigits value is out of range.');
    }
    return new Origine(locale, options);
  };
  try {
    const ancien = await import('../js/calc.js?moteur-ancien');
    assert.equal(ancien.formatEUR(120, {entier: true}), '120 €');
  } finally {
    Intl.NumberFormat = Origine;
  }
});

test("progressionObjectif : le mois en cours, pas terminé, n'est pas jugé en baisse", () => {
  const o = {id: 'v', cible: 1000, debut: '2026-05', fin: '2026-12'};
  const r = progressionObjectif(o, [vers('v', '2026-09', 100), vers('v', '2026-10', 20)], ['2026-09', '2026-10'], '2026-10');
  assert.deepEqual(r[1], {cle: '2026-10', verse: 20, pct: 2, baisse: false, enCours: true});
  assert.equal(r[0].enCours, false);
});

test("formatEUR à l'euro près et élision", () => {
  assert.equal(formatEUR(120, {entier: true}), '120 €');
  assert.equal(formatEUR(120.6, {entier: true, signe: true}), '+121 €');
  assert.equal(formatEUR(1234.5, {entier: true}), '1 235 €');
  assert.equal(de('Amel'), "d'Amel");
  assert.equal(de('Dylan'), 'de Dylan');
});

const CATS = [
  {id: 'c', nom: 'Courses', ordre: 1, active: true}, {id: 't', nom: 'Transport', ordre: 2, active: true},
  {id: 's', nom: 'Santé', ordre: 3, active: false}, {id: 'x', nom: 'Vieux', ordre: 4, active: false},
];
const dep = (categorie_id, montant) => ({categorie_id, montant});
const rec = (montant, extra = {}) => ({montant, ...extra});

test('evolutionCategories : mois non ouvert, catégorie désactivée, hausses 15 % et 20 €', () => {
  const r = evolutionCategories([
    {cle: '2026-05', ouvert: true, depenses: [dep('c', 600), dep('t', 100), dep('s', 20)], recurrentes: [rec(1000)]},
    {cle: '2026-06', ouvert: false, depenses: [], recurrentes: []},
    {cle: '2026-07', ouvert: true, depenses: [dep('c', 400), dep('c', 300)], recurrentes: [rec(1000), rec(80)]},
    {cle: '2026-08', ouvert: true, depenses: [dep('c', 500)], recurrentes: [rec(1000)]},
  ], CATS);
  assert.deepEqual(r.lignes.map((l) => l.categorie.id), ['c', 't', 's']);   // « Vieux » : inactive et sans dépense
  const [courses, transport, sante] = r.lignes;
  assert.deepEqual(courses.valeurs, [600, null, 700, 500]);
  assert.equal(courses.moyenne, 600);
  assert.deepEqual(courses.hausses, [false, false, true, false]);
  assert.deepEqual(transport.valeurs, [100, null, 0, 0]);
  assert.equal(transport.moyenne, 33.33);
  assert.deepEqual(transport.hausses, [true, false, false, false]);
  assert.deepEqual(sante.hausses, [false, false, false, false]);       // +13 € seulement : sous les 20 €
  assert.deepEqual(r.chargesFixes.valeurs, [1000, null, 1080, 1000]);
  assert.equal(r.chargesFixes.moyenne, 1026.67);
  assert.deepEqual(r.chargesFixes.hausses, [false, false, false, false]);
});

test('evolutionCategories : un seul mois, aucun mois ouvert', () => {
  const un = evolutionCategories([{cle: '2026-05', ouvert: true, depenses: [dep('c', 600)], recurrentes: []}], CATS);
  assert.deepEqual(un.lignes[0].hausses, [false]);
  assert.equal(un.chargesFixes.moyenne, 0);
  const aucun = evolutionCategories([{cle: '2026-05', ouvert: false, depenses: [], recurrentes: []}], CATS);
  assert.deepEqual(aucun.lignes.map((l) => l.categorie.id), ['c', 't']);
  assert.deepEqual(aucun.lignes[0].valeurs, [null]);
  assert.equal(aucun.lignes[0].moyenne, null);
  assert.equal(aucun.chargesFixes.moyenne, null);
});

test('entreesSorties : salaires + revenus, charges + dépenses réelles, estimé si à confirmer', () => {
  const d = {membresMois: [{salaire: 1800, solde: 500}, {salaire: 2100, solde: null}],
    revenus: [{montant: 100, dans_solde: true}, {montant: 50}],
    recurrentes: [rec(900, {dans_solde: true}), rec(480, {a_confirmer: true})], depenses: [dep('c', 40), dep('c', 60.5)]};
  assert.deepEqual(entreesSorties(d),
    {entrees: 4050, sorties: 1480.5, salaires: 3900, revenus: 150, charges: 1380, depenses: 100.5, estime: true});
  assert.equal(entreesSorties({...d, recurrentes: [rec(900)]}).estime, false);
});

const vers = (objectif_id, mois_cle, montant) => ({objectif_id, mois_cle, montant});

test('epargneParMois : retraits inclus, prévu au départ des objectifs non archivés actifs ce mois', () => {
  const objectifs = [
    {id: 'v', cible: 1200, debut: '2026-01', fin: '2026-12', archive: false},
    {id: 'a', cible: 600, debut: '2026-07', fin: '2026-12', archive: false},   // commencé en cours de période
    {id: 'z', cible: 500, debut: '2026-01', fin: '2026-12', archive: true},
  ];
  const r = epargneParMois([vers('v', '2026-06', 100), vers('v', '2026-07', 150), vers('a', '2026-07', 50),
    vers('a', '2026-08', -30), vers('z', '2026-06', 40), vers('v', '2026-05', 999)], objectifs, ['2026-06', '2026-07', '2026-08']);
  assert.deepEqual(r.mois, [
    {cle: '2026-06', verse: 140, parObjectif: {v: 100, z: 40}, prevu: 100},
    {cle: '2026-07', verse: 200, parObjectif: {v: 150, a: 50}, prevu: 200},
    {cle: '2026-08', verse: -30, parObjectif: {a: -30}, prevu: 200},
  ]);
  assert.equal(r.totalVerse, 310);
  assert.equal(r.totalPrevu, 500);
  assert.deepEqual(epargneParMois([], objectifs, []), {mois: [], totalVerse: 0, totalPrevu: 0});
});

test("progressionObjectif : % du mois, baisse seulement pendant l'objectif", () => {
  const o = {id: 'v', cible: 1000, debut: '2026-05', fin: '2026-09'};
  const r = progressionObjectif(o, [vers('v', '2026-05', 100), vers('v', '2026-06', 80), vers('v', '2026-06', -10),
    vers('v', '2026-08', 50), vers('v', '2026-10', 30), vers('w', '2026-06', 500)],
  ['2026-04', '2026-05', '2026-06', '2026-08', '2026-10']);
  assert.deepEqual(r, [
    {cle: '2026-04', verse: 0, pct: 0, baisse: false, enCours: false},
    {cle: '2026-05', verse: 100, pct: 10, baisse: false, enCours: false},
    {cle: '2026-06', verse: 70, pct: 7, baisse: true, enCours: false},
    {cle: '2026-08', verse: 50, pct: 5, baisse: true, enCours: false},    // juillet non ouvert : comparé à juin
    {cle: '2026-10', verse: 30, pct: 3, baisse: false, enCours: false},    // après la fin de l'objectif
  ]);
});

const MEMBRES = [{id: 'D', prenom: 'Dylan'}, {id: 'A', prenom: 'Amel'}];
const CATS_R = [{id: 'c', nom: 'Courses'}, {id: 't', nom: 'Transport'}, {id: 'l', nom: 'Loisirs'}];
const PRECEDENT = {
  membresMois: [{membre_id: 'D', salaire: 1800}, {membre_id: 'A', salaire: 2100}],
  revenus: [{libelle: 'CAF', montant: 100}, {libelle: 'Primes', montant: 200}, {libelle: 'Bonus', montant: 50}],
  recurrentes: [{recurrente_id: 'r1', libelle: 'Loyer', montant: 900}, {recurrente_id: 'r3', libelle: 'Nourrice', montant: 400},
    {recurrente_id: 'r5', libelle: 'Gaz', montant: 60}],
  depenses: [dep('c', 600), dep('t', 100), dep('l', 50)],
};
const COURANT = {
  membresMois: [{membre_id: 'D', salaire: 1800}, {membre_id: 'A', salaire: 1950}],
  revenus: [{libelle: 'CAF', montant: 100}, {libelle: 'Bonus', montant: 40}],
  recurrentes: [{recurrente_id: 'r1', libelle: 'Loyer', montant: 900}, {recurrente_id: 'r3', libelle: 'Nourrice', montant: 480},
    {recurrente_id: 'r5', libelle: 'Gaz', montant: 130, a_confirmer: true}, {recurrente_id: 'r9', libelle: 'Assurance', montant: 25}],
  depenses: [dep('c', 720), dep('t', 110), dep('l', 30)],
};

test('raisonsBaisse : 3 plus gros écarts défavorables, en clair', () => {
  assert.deepEqual(raisonsBaisse(COURANT, PRECEDENT, CATS_R, MEMBRES), ['pas de Primes', "salaire d'Amel −150 €", 'Courses +120 €']);
});

test('raisonsBaisse : charges nouvelles ou en hausse, jamais une charge à confirmer', () => {
  const courant = {...COURANT, membresMois: PRECEDENT.membresMois, revenus: PRECEDENT.revenus};
  // Gaz +70 € est à confirmer : il n'est pas cité
  assert.deepEqual(raisonsBaisse(courant, PRECEDENT, CATS_R, MEMBRES), ['Courses +120 €', 'Nourrice +80 €', 'Assurance +25 €']);
});

test("raisonsBaisse : une charge n'est pas comparée à l'estimation du mois précédent", () => {
  const vide = {membresMois: [], revenus: [], recurrentes: [], depenses: []};
  // Nourrice : 400 € recopiés (à confirmer) le mois précédent, 480 € confirmés ce mois-ci
  assert.deepEqual(raisonsBaisse({...vide, recurrentes: [{recurrente_id: 'r3', libelle: 'Nourrice', montant: 480}]},
    {...vide, recurrentes: [{recurrente_id: 'r3', libelle: 'Nourrice', montant: 400, a_confirmer: true}]}, CATS_R, MEMBRES), []);
});

test('raisonsBaisse : revenu en baisse, seuil de 20 € inclus, rien → []', () => {
  const vide = {membresMois: [], revenus: [], recurrentes: [], depenses: []};
  assert.deepEqual(raisonsBaisse({...vide, revenus: [{libelle: 'Primes', montant: 170}]},
    {...vide, revenus: [{libelle: 'Primes', montant: 200}]}, CATS_R, MEMBRES), ['Primes −30 €']);
  assert.deepEqual(raisonsBaisse({...vide, depenses: [dep('c', 620)]}, {...vide, depenses: [dep('c', 600)]}, CATS_R, MEMBRES),
    ['Courses +20 €']);
  assert.deepEqual(raisonsBaisse({...vide, depenses: [dep('c', 619)]}, {...vide, depenses: [dep('c', 600)]}, CATS_R, MEMBRES), []);
  // Charge sans modèle : appariée par libellé
  assert.deepEqual(raisonsBaisse({...vide, recurrentes: [{recurrente_id: null, libelle: 'Cantine', montant: 90}]},
    {...vide, recurrentes: [{recurrente_id: null, libelle: 'Cantine', montant: 60}]}, CATS_R, MEMBRES), ['Cantine +30 €']);
});

const VACANCES = {id: 'v', cible: 3000, debut: '2026-01', fin: '2027-06'};
const DEBUT_ANNEE = ['01', '02', '03', '04', '05', '06'].map((m) => vers('v', `2026-${m}`, 200));

test('projectionObjectif : rythme des 3 derniers mois terminés, en avance', () => {
  const p = projectionObjectif(VACANCES,
    [...DEBUT_ANNEE, vers('v', '2026-07', 200), vers('v', '2026-08', 180), vers('v', '2026-09', 120), vers('v', '2026-10', 150)],
    '2026-10');
  // reste 1150 € à 166,67 €/mois à partir de novembre (octobre déjà versé) : 7 mois → mai 2027
  assert.deepEqual(p, {statut: 'projete', rythme: 166.67, moisAtteinte: '2027-05', enAvance: true, effortNecessaire: 143.75, echu: false});
});

test('projectionObjectif : en retard, mois sans versement = 0, ce mois-ci pas encore versé', () => {
  const p = projectionObjectif(VACANCES, [...DEBUT_ANNEE, vers('v', '2026-07', 150), vers('v', '2026-09', 0)], '2026-10');
  // rythme (150 + 0 + 0) / 3 = 50 ; reste 1650 € à partir d'octobre : 33 mois → juin 2029
  assert.equal(p.rythme, 50);
  assert.equal(p.moisAtteinte, '2029-06');
  assert.equal(p.enAvance, false);
  assert.equal(p.effortNecessaire, 183.33);   // 1650 / 9 mois (octobre → juin)
});

test('projectionObjectif : objectif récent, aucun mois terminé, rythme nul, atteint', () => {
  const recent = {id: 'r', cible: 1000, debut: '2026-09', fin: '2027-08'};
  const p = projectionObjectif(recent, [vers('r', '2026-09', 100), vers('r', '2026-08', 500)], '2026-10');
  assert.equal(p.rythme, 100);                 // seul septembre compte (août est avant le début)
  assert.equal(p.moisAtteinte, '2027-01');     // reste 400 € (les 500 € d'août restent versés) : octobre → janvier
  assert.equal(projectionObjectif({...recent, debut: '2026-10'}, [], '2026-10').statut, 'sans');
  const nul = projectionObjectif(VACANCES, [...DEBUT_ANNEE, vers('v', '2026-08', 100), vers('v', '2026-09', -100)], '2026-10');
  assert.equal(nul.statut, 'non_atteint');
  assert.equal(nul.moisAtteinte, null);
  assert.equal(projectionObjectif(VACANCES, [vers('v', '2026-05', 3000)], '2026-10').statut, 'atteint');
});
