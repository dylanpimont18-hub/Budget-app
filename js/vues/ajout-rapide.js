// Bouton « + » flottant : saisie d'une dépense en quelques touchers, depuis n'importe quel onglet.
import {ajouterDepense} from '../db.js';
import {etat, recharger} from '../etat.js';
import {formatEUR} from '../calc.js';
import {ouvrirFeuille, toast} from '../ui.js';
import {formulaireDepense, categorieDe} from './depenses.js';

export function initAjoutRapide(bouton) {
  bouton.addEventListener('click', () => {
    if (!etat.donnees) return;
    let feuille;
    const form = formulaireDepense({
      onValider: async (champs) => {
        await ajouterDepense(etat.foyer.id, champs);
        feuille.fermer();
        toast(`${formatEUR(champs.montant)} ajoutés à ${categorieDe(champs.categorie_id).nom}`);
        await recharger();
      },
    });
    feuille = ouvrirFeuille(form, {titre: 'Nouvelle dépense'});
    // Focus immédiat (dans le geste) pour que le clavier s'ouvre aussi sur iPhone
    form.querySelector('#depense-montant').focus();
  });
}
