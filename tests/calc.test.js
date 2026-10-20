import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMontant, formatEUR, cleMois, decalerMois, nbMois, libelleMois, niveauBudget,
  syntheseMois, depensesParCategorie, totalParMembre, topPostes,
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
test('syntheseMois', () => {
  const s = syntheseMois({salaires: [2000, 2300], revenus: [100], recurrentes: [765.79, 90.39],
                          budgets: [750, 350], versements: [100]});
  assert.deepEqual(s, {revenus: 4400, chargesFixes: 856.18, budgets: 1100, objectifs: 100,
                       resteLibre: 2343.82, pctResteLibre: 53.27});
  assert.equal(syntheseMois({salaires: [], revenus: [], recurrentes: [10], budgets: [], versements: []}).pctResteLibre, null);
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
  assert.equal(r.statut, 'retard'); assert.equal(r.prevu, 300);
  assert.equal(r.moisRestants, 10); assert.equal(r.effortRecalcule, 110);
  assert.equal(suiviObjectif(o, [{mois_cle: '2026-10', montant: 300}], '2026-11').statut, 'avance');
  const e = suiviObjectif(o, [{mois_cle: '2026-10', montant: 500}], '2028-01');
  assert.equal(e.echu, true); assert.equal(e.moisRestants, 0); assert.equal(e.effortRecalcule, 0);
  assert.equal(suiviObjectif(o, [{mois_cle: '2026-10', montant: 1200}], '2026-10').statut, 'atteint');
});
