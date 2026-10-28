// Part d'un membre pour un mois : solde, salaire déjà compris dedans ou non, montant du salaire.
// Partagée par l'ouverture du mois (sa part, et celle de l'autre si on la connaît) et l'onglet Budget.
import {etat} from '../etat.js';
import {libelleMois, decalerMois, de} from '../calc.js';
import {el, champMontant, choixOuiNon} from '../ui.js';

export {de};

const nomMois = (cle) => libelleMois(cle).split(' ')[0];

// valeurs : {salaire, solde, salaire_dans_solde} ; premiereFois : la part n'a pas encore été remplie ce mois-ci.
// Payé·e fin du mois précédent (réglage du profil) : la réponse est préremplie sur Oui, toujours modifiable.
export function formulairePart({membre, cle, valeurs = {}, premiereFois = true}) {
  const soi = membre.id === etat.moi.id;
  const mois = nomMois(cle);
  const prefixe = `part-${membre.id}`;

  // Le solde vient en premier : c'est avec lui qu'on vit. Si le salaire y est déjà, son montant est facultatif.
  const solde = champMontant({id: `${prefixe}-solde`, etiquette: soi ? 'Solde actuel de ton compte' : `Solde du compte ${de(membre.prenom)}`,
    valeur: valeurs.solde ?? null, negatif: true, vide: 'null', grand: true});
  const salaireProbable = valeurs.salaire ?? membre.salaire_defaut ?? 0;
  const salaire = champMontant({id: `${prefixe}-salaire`, etiquette: 'Salaire', valeur: salaireProbable, vide: 'null'});
  const aideSalaire = el('p', {class: 'attenue', style: {margin: 0}});
  const blocSalaire = el('div', {class: 'formulaire', hidden: true}, salaire.element, aideSalaire);
  const erreur = el('p', {class: 'message-erreur', 'aria-live': 'polite'});
  const afficherSalaire = (oui) => {
    if (oui == null) return;
    salaire.element.querySelector('label').textContent = oui ? 'Montant reçu (facultatif)' : 'Salaire attendu';
    aideSalaire.textContent = oui ? 'Déjà compris dans le solde : il ne sert qu\'aux rapports.' : 'Il sera ajouté au solde dans le calcul.';
    blocSalaire.hidden = false;
    erreur.textContent = '';
  };

  let question;
  if (!premiereFois) question = `Salaire de ${mois} déjà compris dans le solde ?`;
  else if (soi) question = `Ton salaire de ${mois} est déjà dans ce solde ?`;
  else question = `Le salaire de ${mois} ${de(membre.prenom)} est déjà dans ce solde ?`;
  const reponseInitiale = premiereFois ? (membre.paie_mois_precedent ? true : null) : Boolean(valeurs.salaire_dans_solde);
  const recu = choixOuiNon({etiquette: question, valeur: reponseInitiale, non: premiereFois ? 'Pas encore' : 'Non',
    surChange: afficherSalaire});
  afficherSalaire(reponseInitiale);

  const indice = premiereFois
    ? el('p', {class: 'attenue', style: {margin: 0}}, `Payé fin ${nomMois(decalerMois(cle, -1))} pour ${mois} ? Réponds Oui.`)
    : null;

  return {
    element: el('div', {class: 'formulaire'}, solde.element, el('div', {}, recu.element, indice, erreur), blocSalaire),
    focus: () => solde.input.focus(),
    repondu: () => recu.lire() != null,
    soldeSaisi: () => solde.lire().valeur != null,
    // {ok, valeurs} ; signale l'oubli de la question et les montants invalides
    valider() {
      const s = salaire.valider();
      const o = solde.valider();
      if (recu.lire() == null) {
        erreur.textContent = 'Réponds d\'abord à cette question';
        recu.element.scrollIntoView({behavior: 'smooth', block: 'center'});
        return {ok: false};
      }
      if (!s.ok || !o.ok) return {ok: false};
      const oui = recu.lire();
      // Salaire déjà sur le compte : sans solde, rien ne permettrait de le compter
      if (oui && o.valeur == null) {
        erreur.textContent = `Saisis ${soi ? 'ton' : 'son'} solde : c'est lui qui sert de point de départ`;
        solde.input.focus();
        return {ok: false};
      }
      if (!oui && s.valeur == null) {
        erreur.textContent = 'Indique le salaire attendu';
        salaire.input.focus();
        return {ok: false};
      }
      return {ok: true, valeurs: {membre_id: membre.id, salaire: s.valeur ?? salaireProbable, solde: o.valeur, salaire_dans_solde: oui}};
    },
  };
}
