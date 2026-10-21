// Onglet Rapports (ordinateur seulement).
import {el} from '../ui.js';

export function rendreRapports(conteneur) {
  conteneur.append(el('h1', {}, 'Rapports'));
}

export function quitterRapports() {}
