// Bouton « + » flottant : saisie d'une dépense (ou d'un revenu : prime, remboursement…) en quelques touchers,
// depuis n'importe quel onglet.
import {ajouterDepense, ajouterRevenu} from '../db.js';
import {etat, recharger} from '../etat.js';
import {formatEUR, libelleMois} from '../calc.js';
import {el, ouvrirFeuille, toast} from '../ui.js';
import {formulaireDepense, categorieDe} from './depenses.js';
import {formulaireRevenu} from './reglages.js';

export function initAjoutRapide(bouton) {
  bouton.addEventListener('click', () => {
    if (!etat.donnees) return;
    let feuille;
    const terminer = async (texte) => {
      feuille.fermer();
      toast(texte);
      await recharger();
    };
    const depense = formulaireDepense({
      onValider: async (champs) => {
        await ajouterDepense(etat.foyer.id, champs);
        await terminer(`${formatEUR(champs.montant)} ajoutés à ${categorieDe(champs.categorie_id).nom}`);
      },
    });
    // Le revenu va dans le mois affiché ; il faut qu'il soit ouvert
    const revenu = etat.donnees.mois
      ? formulaireRevenu({libelleBouton: 'Ajouter le revenu', onValider: async (champs) => {
          await ajouterRevenu(etat.foyer.id, etat.donnees.mois.id, champs);
          await terminer(`${formatEUR(champs.montant)} de revenu ajoutés à ${libelleMois(etat.moisCle)}`);
        }})
      : {form: el('p', {class: 'vide-liste'}, 'Ce mois n\'a pas été ouvert.'), focus: () => {}};
    revenu.form.hidden = true;

    const titres = {depense: 'Nouvelle dépense', revenu: 'Nouveau revenu'};
    const choisir = (type, e) => {
      for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
      depense.hidden = type !== 'depense';
      revenu.form.hidden = type !== 'revenu';
      e.currentTarget.closest('.feuille').querySelector('h2').textContent = titres[type];
      if (type === 'revenu') revenu.focus();
      else depense.querySelector('#depense-montant').focus();
    };
    const contenu = el('div', {class: 'formulaire'},
      el('div', {class: 'segment', role: 'group', 'aria-label': 'Type d\'ajout'},
        el('button', {type: 'button', 'aria-pressed': 'true', onclick: (e) => choisir('depense', e)}, 'Dépense'),
        el('button', {type: 'button', 'aria-pressed': 'false', onclick: (e) => choisir('revenu', e)}, 'Revenu')),
      depense, revenu.form);
    feuille = ouvrirFeuille(contenu, {titre: titres.depense});
    // Focus immédiat (dans le geste) pour que le clavier s'ouvre aussi sur iPhone
    depense.querySelector('#depense-montant').focus();
  });
}
