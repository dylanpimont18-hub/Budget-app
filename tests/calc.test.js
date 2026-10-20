import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMontant, formatEUR, cleMois, decalerMois, nbMois, libelleMois, niveauBudget,
  syntheseMois, bilanMois, depensesParCategorie, totalParMembre, topPostes,
  effortMensuel, cibleDepuisMensuel, suiviObjectif,
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
