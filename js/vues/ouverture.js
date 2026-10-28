// Ouverture du mois : sa propre part (salaire, solde), celle de l'autre si on la connaît, autres revenus, versements.
// Les charges (déjà prélevées ? montant variable ?) se passent ensuite en revue dans l'onglet Récurrentes.
// Le solde est le point de départ du calcul : on note ce qui y est déjà compris pour ne rien compter deux fois.
import {ouvrirMois, chargerMois} from '../db.js';
import {etat, recharger} from '../etat.js';
import {libelleMois, suiviObjectif} from '../calc.js';
import {el, champMontant, caseACocher, toast} from '../ui.js';
import {formulairePart, de} from './part-membre.js';
import {estArchive} from './objectifs.js';

const REVENUS_PAR_DEFAUT = ['Allocations familiales (CAF)', 'Autres revenus (primes…)'];

function titreOuverture(cle) {
  const libelle = libelleMois(cle);
  return /^[aeiouyéèêh]/i.test(libelle) ? `Ouverture d'${libelle}` : `Ouverture de ${libelle}`;
}

export async function rendreOuverture(conteneur, {apres, annuler}) {
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
  const nouveauChamp = (options) => {
    const c = champMontant(options);
    champs.push(c);
    return c;
  };

  // Ma part, obligatoire ; celle des autres, facultative (sinon ils la rempliront depuis l'onglet Budget)
  const moi = etat.moi;
  const valeursAvant = (m) => ({salaire: precedent?.membresMois.find((x) => x.membre_id === m.id)?.salaire});
  const maPart = formulairePart({membre: etat.membres.find((m) => m.id === moi.id) ?? moi, cle, valeurs: valeursAvant(moi)});
  const autresParts = etat.membres.filter((m) => m.id !== moi.id).map((m) => ({
    membre: m,
    part: formulairePart({membre: m, cle, valeurs: valeursAvant(m)}),
  }));

  // Autres revenus
  const lignesRevenus = [];
  const listeRevenus = el('div', {class: 'formulaire'});
  const ajouterRevenu = (libelle = '', montant = null) => {
    const idx = lignesRevenus.length;
    const texte = el('input', {class: 'champ', id: `revenu-libelle-${idx}`, value: libelle, placeholder: 'Libellé',
      autocomplete: 'off', 'aria-label': 'Libellé du revenu'});
    const champ = nouveauChamp({id: `revenu-montant-${idx}`, valeur: montant, vide: 'zero'});
    const dejaRecu = caseACocher({etiquette: 'Déjà sur le compte'});
    const ligne = {
      lire: () => {
        const valeur = champ.lire().valeur;
        return {libelle: texte.value.trim() || (valeur ? 'Autre revenu' : ''), montant: valeur, dans_solde: dejaRecu.lire()};
      },
      element: el('div', {class: 'ligne-revenu formulaire'},
        el('div', {class: 'rangee', style: {alignItems: 'center'}},
          texte,
          el('button', {class: 'btn-icone', type: 'button', style: {flex: '0 0 44px'}, 'aria-label': 'Retirer ce revenu', onclick: () => {
            ligne.element.remove();
            lignesRevenus.splice(lignesRevenus.indexOf(ligne), 1);
            champs.splice(champs.indexOf(champ), 1);
          }}, '✕')),
        el('div', {class: 'rangee', style: {alignItems: 'flex-start'}},
          el('div', {style: {flex: '1'}}, champ.element),
          el('div', {style: {flex: '1'}}, dejaRecu.element))),
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
    const mienne = maPart.valider();
    if (!mienne.ok) return;
    // La part d'un autre n'est envoyée que si l'on a répondu à sa question
    const parts = [mienne.valeurs];
    for (const {part, details} of autresParts) {
      if (!part.repondu() && !part.soldeSaisi()) continue;
      details.open = true;
      const r = part.valider();
      if (!r.ok) return;
      parts.push(r.valeurs);
    }
    if (resultats.some((r) => !r.ok)) {
      message.textContent = 'Corrige les champs en rouge';
      return;
    }
    const avecSolde = parts.some((p) => p.solde != null);
    btnValider.disabled = true;
    try {
      const resultat = await ouvrirMois(cle,
        parts,
        lignesRevenus.map((l) => l.lire()).filter((r) => r.libelle && r.montant > 0)
          .map((r) => ({...r, dans_solde: avecSolde && r.dans_solde})),
        lignesObjectifs.map((l) => l.lire()).filter((v) => v.montant),
        []);
      if (resultat && !resultat.cree) toast('Le mois était déjà ouvert : seule ta part a été ajoutée.');
      await recharger();
      apres();
    } catch (err) {
      message.textContent = err.message;
      btnValider.disabled = false;
    }
  }

  section.replaceChildren(
    el('h1', {}, titreOuverture(cle)),
    el('p', {class: 'attenue'}, annuler ? 'Ouverture en avance : ta paye est arrivée avant le 1er.' : 'Nouveau mois :',
      ' note ce qui est déjà arrivé sur les comptes, pour que rien ne soit compté deux fois.'),
    el('form', {class: 'formulaire', onsubmit: valider, novalidate: true},
      el('div', {class: 'carte formulaire'},
        el('h2', {}, `Ta part · ${moi.prenom}`),
        maPart.element),
      autresParts.map((a) => {
        a.details = el('details', {class: 'carte repliable'},
          el('summary', {}, `Remplir aussi la part ${de(a.membre.prenom)}`),
          el('p', {class: 'attenue', style: {margin: '0 0 12px'}},
            `Facultatif : sinon ${a.membre.prenom} la remplira depuis l'onglet Budget.`),
          a.part.element);
        return a.details;
      }),
      el('div', {class: 'carte formulaire'},
        el('h2', {}, 'Autres revenus du foyer'),
        listeRevenus,
        el('button', {class: 'btn-texte', type: 'button', onclick: () => ajouterRevenu()}, '+ Ajouter un revenu')),
      lignesObjectifs.length ? el('h2', {}, 'Objectifs d\'épargne') : null,
      lignesObjectifs.map((l) => l.element),
      message,
      btnValider,
      el('p', {class: 'attenue', style: {textAlign: 'center', margin: 0}},
        'Ensuite, tu passeras en revue les charges du mois.'),
      // Ouverture en avance : on peut revenir au mois calendaire
      annuler ? el('button', {class: 'btn-texte', type: 'button', onclick: annuler}, 'Pas maintenant') : null));
}
