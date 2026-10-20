// Ouverture du mois : sa propre part (salaire, solde), autres revenus, versements vers les objectifs.
// Les charges (déjà prélevées ? montant variable ?) se passent ensuite en revue dans l'onglet Récurrentes.
// Le solde est le point de départ du calcul : on note ce qui y est déjà compris pour ne rien compter deux fois.
import {ouvrirMois, chargerMois} from '../db.js';
import {etat, recharger} from '../etat.js';
import {libelleMois, suiviObjectif} from '../calc.js';
import {el, champMontant, choixOuiNon, caseACocher, toast} from '../ui.js';
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
  const nouveauChamp = (options) => {
    const c = champMontant(options);
    champs.push(c);
    return c;
  };

  // Ma part : les autres membres rempliront la leur depuis l'onglet Budget
  const moi = etat.moi;
  const avant = precedent?.membresMois.find((x) => x.membre_id === moi.id);
  const salaire = nouveauChamp({id: 'salaire', etiquette: 'Salaire', valeur: avant?.salaire ?? moi.salaire_defaut});
  const aideSalaire = el('p', {class: 'attenue', style: {margin: 0}});
  const blocSalaire = el('div', {class: 'formulaire', hidden: true}, salaire.element, aideSalaire);
  const recu = choixOuiNon({etiquette: 'Ton salaire est déjà arrivé ?', non: 'Pas encore', surChange: (oui) => {
    salaire.element.querySelector('label').textContent = oui ? 'Salaire reçu' : 'Salaire attendu';
    aideSalaire.textContent = oui ? 'Il est déjà compris dans ton solde ci-dessous.' : 'Il sera ajouté à ton solde dans le calcul.';
    blocSalaire.hidden = false;
    erreurRecu.textContent = '';
  }});
  const erreurRecu = el('p', {class: 'message-erreur', 'aria-live': 'polite'});
  const solde = nouveauChamp({id: 'solde', etiquette: 'Solde actuel de ton compte', negatif: true, vide: 'null'});
  const autres = etat.membres.filter((m) => m.id !== moi.id).map((m) => m.prenom);

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
    if (recu.lire() == null) {
      erreurRecu.textContent = 'Réponds d\'abord à cette question';
      recu.element.scrollIntoView({behavior: 'smooth', block: 'center'});
      return;
    }
    if (resultats.some((r) => !r.ok)) {
      message.textContent = 'Corrige les champs en rouge';
      return;
    }
    const avecSolde = solde.lire().valeur != null;
    btnValider.disabled = true;
    try {
      const resultat = await ouvrirMois(cle,
        [{membre_id: moi.id, salaire: salaire.lire().valeur, solde: solde.lire().valeur, salaire_dans_solde: recu.lire()}],
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
    el('p', {class: 'attenue'}, 'Nouveau mois : note ce qui est déjà arrivé sur les comptes, pour que rien ne soit compté deux fois.'),
    el('form', {class: 'formulaire', onsubmit: valider, novalidate: true},
      el('div', {class: 'carte formulaire'},
        el('h2', {}, `Ta part · ${moi.prenom}`),
        el('div', {}, recu.element, erreurRecu), blocSalaire, solde.element,
        autres.length
          ? el('p', {class: 'attenue', style: {margin: 0}}, `${autres.join(' et ')} remplira sa part depuis l'onglet Budget.`)
          : null),
      el('div', {class: 'carte formulaire'},
        el('h2', {}, 'Autres revenus du foyer'),
        listeRevenus,
        el('button', {class: 'btn-texte', type: 'button', onclick: () => ajouterRevenu()}, '+ Ajouter un revenu')),
      lignesObjectifs.length ? el('h2', {}, 'Objectifs d\'épargne') : null,
      lignesObjectifs.map((l) => l.element),
      message,
      btnValider,
      el('p', {class: 'attenue', style: {textAlign: 'center', margin: 0}},
        'Ensuite, tu passeras en revue les charges du mois.')));
}
