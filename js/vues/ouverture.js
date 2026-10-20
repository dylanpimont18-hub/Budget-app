// Ouverture du mois : salaires, soldes (information), autres revenus, versements vers les objectifs.
import {ouvrirMois, chargerMois} from '../db.js';
import {etat, recharger} from '../etat.js';
import {libelleMois, suiviObjectif} from '../calc.js';
import {el, champMontant, toast} from '../ui.js';
import {estArchive} from './objectifs.js';

const REVENUS_PAR_DEFAUT = ['Allocations familiales (CAF)', 'Autres revenus (primes…)'];

function titreOuverture(cle) {
  const libelle = libelleMois(cle);
  return /^[aeiouyéèêh]/i.test(libelle) ? `Ouverture d'${libelle}` : `Ouverture de ${libelle}`;
}

export async function rendreOuverture(conteneur, {apres}) {
  const cle = etat.moisCourantCle;
  const section = el('section', {}, el('h1', {}, titreOuverture(cle)), el('p', {class: 'chargement'}, 'Chargement…'));
  conteneur.append(section);

  // Pré-remplissage depuis le dernier mois ouvert
  let precedent = null;
  const dernier = etat.donnees.moisDisponibles.find((c) => c < cle);
  if (dernier) {
    try {
      precedent = await chargerMois(etat.foyer.id, dernier);
    } catch (e) {
      toast(e.message, {type: 'erreur'});
    }
  }

  const champs = [];
  const btnValider = el('button', {class: 'btn-primaire', type: 'submit'}, 'Ouvrir le mois');
  const majBouton = () => { btnValider.disabled = champs.some((c) => !c.lire().ok); };
  const nouveauChamp = (options) => {
    const c = champMontant({...options, surChange: majBouton});
    champs.push(c);
    return c;
  };

  // Membres
  const lignesMembres = etat.membres.map((m) => {
    const avant = precedent?.membresMois.find((x) => x.membre_id === m.id);
    const salaire = nouveauChamp({id: `salaire-${m.id}`, etiquette: 'Salaire touché',
      valeur: avant?.salaire ?? m.salaire_defaut});
    const solde = nouveauChamp({id: `solde-${m.id}`, etiquette: 'Solde actuel du compte', negatif: true, vide: 'null'});
    return {
      membre: m,
      element: el('div', {class: 'carte formulaire'}, el('h2', {}, m.prenom), salaire.element, solde.element,
        el('p', {class: 'attenue', style: {margin: 0}}, 'Le solde est une simple information : il n\'entre dans aucun calcul.')),
      lire: () => ({membre_id: m.id, salaire: salaire.lire().valeur, solde: solde.lire().valeur}),
    };
  });

  // Autres revenus
  const lignesRevenus = [];
  const listeRevenus = el('div', {class: 'formulaire'});
  const ajouterRevenu = (libelle = '', montant = null) => {
    const idx = lignesRevenus.length;
    const texte = el('input', {class: 'champ', id: `revenu-libelle-${idx}`, value: libelle, placeholder: 'Libellé',
      autocomplete: 'off', 'aria-label': 'Libellé du revenu'});
    const champ = nouveauChamp({id: `revenu-montant-${idx}`, valeur: montant, vide: 'zero'});
    const ligne = {
      lire: () => {
        const montant = champ.lire().valeur;
        return {libelle: texte.value.trim() || (montant ? 'Autre revenu' : ''), montant};
      },
      element: el('div', {class: 'rangee', style: {alignItems: 'flex-start'}},
        el('div', {style: {flex: '3'}}, texte),
        el('div', {style: {flex: '2'}}, champ.element),
        el('button', {class: 'btn-icone', type: 'button', 'aria-label': 'Retirer ce revenu', onclick: () => {
          ligne.element.remove();
          lignesRevenus.splice(lignesRevenus.indexOf(ligne), 1);
          champs.splice(champs.indexOf(champ), 1);
          majBouton();
        }}, '✕')),
    };
    lignesRevenus.push(ligne);
    listeRevenus.append(ligne.element);
  };
  if (precedent?.revenus.length) precedent.revenus.forEach((r) => ajouterRevenu(r.libelle, r.montant));
  else REVENUS_PAR_DEFAUT.forEach((l) => ajouterRevenu(l));

  // Objectifs actifs ce mois-ci
  const objectifs = etat.donnees.objectifs.filter((o) => !estArchive(o) && o.debut <= cle && cle <= o.fin);
  const lignesObjectifs = objectifs.map((o) => {
    const versements = etat.donnees.versementsTous.filter((v) => v.objectif_id === o.id);
    const propose = suiviObjectif(o, versements, cle).effortRecalcule;
    const champ = nouveauChamp({id: `versement-${o.id}`, etiquette: 'Versement ce mois-ci', valeur: propose, vide: 'zero'});
    let qui = null;
    const boutons = [...etat.membres.map((m) => ({id: m.id, nom: m.prenom})), {id: null, nom: 'Commun'}].map((choix) =>
      el('button', {type: 'button', 'aria-pressed': String(choix.id === qui), onclick: (e) => {
        qui = choix.id;
        for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
      }}, choix.nom));
    return {
      element: el('div', {class: 'carte formulaire'},
        el('h3', {style: {margin: 0}}, `${o.icone ?? '🎯'} ${o.nom}`),
        champ.element,
        el('div', {}, el('span', {class: 'etiquette'}, 'Versé par'), el('div', {class: 'segment'}, boutons))),
      lire: () => ({objectif_id: o.id, montant: champ.lire().valeur, membre_id: qui}),
    };
  });

  const message = el('p', {class: 'message-erreur', 'aria-live': 'polite'});

  async function valider(e) {
    e.preventDefault();
    message.textContent = '';
    const resultats = champs.map((c) => c.valider());
    if (resultats.some((r) => !r.ok)) {
      message.textContent = 'Corrige les champs en rouge';
      majBouton();
      return;
    }
    btnValider.disabled = true;
    try {
      await ouvrirMois(cle,
        lignesMembres.map((l) => l.lire()),
        lignesRevenus.map((l) => l.lire()).filter((r) => r.libelle),
        lignesObjectifs.map((l) => l.lire()).filter((v) => v.montant));
      await recharger();
      apres();
    } catch (err) {
      message.textContent = err.message;
      btnValider.disabled = false;
    }
  }

  section.replaceChildren(
    el('h1', {}, titreOuverture(cle)),
    el('p', {class: 'attenue'}, 'Nouveau mois : indiquez ce qui est arrivé sur les comptes.'),
    el('form', {class: 'formulaire', onsubmit: valider, novalidate: true},
      lignesMembres.map((l) => l.element),
      el('div', {class: 'carte formulaire'},
        el('h2', {}, 'Autres revenus du foyer'),
        listeRevenus,
        el('button', {class: 'btn-texte', type: 'button', onclick: () => ajouterRevenu()}, '+ Ajouter un revenu')),
      lignesObjectifs.length ? el('h2', {}, 'Objectifs d\'épargne') : null,
      lignesObjectifs.map((l) => l.element),
      message,
      btnValider));
  majBouton();
}
