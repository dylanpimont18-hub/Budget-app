import test from 'node:test';
import assert from 'node:assert/strict';
import {etatMiseAJour} from '../js/mise-a-jour.js';

test('etatMiseAJour : à jour, disponible, ou pas encore arrivée après une tentative', () => {
  assert.equal(etatMiseAJour('4f29ac2', '4f29ac2', null), 'a_jour');
  assert.equal(etatMiseAJour('4f29ac2', 'b81c0d3', null), 'disponible');
  // On a déjà tenté de passer à b81c0d3 et l'ancien code tourne toujours : on le dit au lieu de prétendre que c'est bon
  assert.equal(etatMiseAJour('4f29ac2', 'b81c0d3', 'b81c0d3'), 'en_attente');
  // Une tentative vers une version plus ancienne ne compte pas pour la nouvelle
  assert.equal(etatMiseAJour('4f29ac2', 'c99e1a2', 'b81c0d3'), 'disponible');
});

test('etatMiseAJour : en local (version non inscrite) ou version en ligne illisible, rien à signaler', () => {
  assert.equal(etatMiseAJour('__VERSION__', 'b81c0d3', null), 'a_jour');
  assert.equal(etatMiseAJour('4f29ac2', null, null), 'a_jour');
});
