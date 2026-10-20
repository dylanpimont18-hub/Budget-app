// Onglet Récurrentes : charges fixes du mois (communes ou personnelles, montant fixe ou variable)
// et revue de début de mois par swipe, où l'on saisit aussi le montant des charges variables.
import {ajouterRecurrente, modifierRecurrente, confirmerMontant, retirerDuMois, restaurerDansMois, supprimerRecurrente}
  from '../db.js';
import {etat, recharger} from '../etat.js';
import {formatEUR, libelleMois} from '../calc.js';
import {el, ajouter, ouvrirFeuille, toast, champMontant, caseACocher} from '../ui.js';

const ICONES = ['🏡', '🏦', '⚡', '💧', '🛡️', '📱', '👶', '🍽️', '🧾', '🚗', '💡', '📺', '🏋️', '🐾', '💳', '📦'];
const SEUIL_SWIPE = 100;

// Session de revue, conservée entre deux rendus (le temps réel re-rend l'onglet)
let revue = null;

const enLectureSeule = () => etat.moisCle !== etat.moisCourantCle;
const prenomDe = (id) => etat.membres.find((m) => m.id === id)?.prenom;

export function rendreRecurrentes(conteneur, {revue: demarrerRevue = false} = {}) {
  const donnees = etat.donnees;
  if (!donnees?.mois) {
    conteneur.append(el('h1', {}, 'Récurrentes'), el('p', {class: 'vide-liste'}, 'Ce mois n\'a pas été ouvert.'));
    return;
  }
  if (demarrerRevue && !enLectureSeule()) commencerRevue();
  if (revue && (revue.moisId !== donnees.mois.id || enLectureSeule())) revue = null;

  if (revue) rendreRevue(conteneur);
  else rendreListe(conteneur);
}

// Pendant la revue, le bouton « + » flottant masquerait « Terminer »
const boutonAjout = (visible) => {
  const b = document.getElementById('btn-ajout-rapide');
  if (b) b.hidden = !visible;
};

// ── Liste ──────────────────────────────────────────────────────────────

function rendreListe(conteneur) {
  boutonAjout(true);
  const {recurrentes} = etat.donnees;
  const lectureSeule = enLectureSeule();
  const total = recurrentes.reduce((t, r) => t + Number(r.montant), 0);

  // Communes d'abord, puis les charges personnelles de chacun
  const groupes = [{titre: 'Communes', lignes: recurrentes.filter((r) => !prenomDe(r.membre_id))},
    ...etat.membres.map((m) => ({titre: `Perso · ${m.prenom}`, lignes: recurrentes.filter((r) => r.membre_id === m.id)}))]
    .filter((g) => g.lignes.length);

  const ligne = (r) => {
    let sous = null;
    if (r.a_confirmer) sous = el('span', {class: 'pastille statut-retard'}, 'Montant à confirmer');
    else if (r.dans_solde) sous = 'Déjà prélevée';
    else if (r.variable) sous = 'Montant variable';
    return el('li', {},
      el(lectureSeule ? 'div' : 'button', {class: 'ligne', type: lectureSeule ? null : 'button',
        onclick: lectureSeule ? null : () => (r.a_confirmer ? ouvrirConfirmation(r) : ouvrirEdition(r))},
        el('span', {class: 'ligne-icone', 'aria-hidden': 'true'}, r.icone ?? '📌'),
        el('span', {class: 'ligne-texte'}, el('div', {class: 'ligne-titre'}, r.libelle),
          sous ? el('div', {class: 'ligne-sous'}, sous) : null),
        el('span', {class: 'ligne-montant montant'}, formatEUR(Number(r.montant)))));
  };

  ajouter(conteneur, [
    el('div', {class: 'entete-vue'},
      el('h1', {}, 'Récurrentes'),
      el('span', {class: 'total-entete montant'}, formatEUR(total))),
    el('p', {class: 'attenue'}, `Charges fixes · ${libelleMois(etat.moisCle)}`, lectureSeule ? ' · lecture seule' : ''),
    groupes.length
      ? groupes.map((g) => [
          el('div', {class: 'titre-groupe'}, el('span', {}, g.titre),
            el('span', {class: 'montant'}, formatEUR(g.lignes.reduce((t, r) => t + Number(r.montant), 0)))),
          el('ul', {class: 'liste'}, g.lignes.map(ligne))])
      : el('p', {class: 'vide-liste'}, 'Aucune charge fixe ce mois-ci.'),
    lectureSeule ? null : el('div', {class: 'actions'},
      el('button', {class: 'btn-secondaire', type: 'button', onclick: () => ouvrirEdition(null)}, '+ Ajouter une charge'),
      recurrentes.length
        ? el('button', {class: 'btn-texte', type: 'button', onclick: () => {
            commencerRevue();
            conteneur.replaceChildren();
            rendreRevue(conteneur);
          }}, 'Revoir les charges')
        : null)]);
}

// Saisie rapide du montant d'une charge variable (aussi ouverte depuis l'onglet Budget)
export function ouvrirConfirmation(ligne) {
  const champ = champMontant({id: 'confirmation-montant', etiquette: `Montant de ${libelleMois(etat.moisCle)}`,
    valeur: ligne.montant, grand: true});
  const message = el('p', {class: 'message-erreur', 'aria-live': 'polite'});
  const bouton = el('button', {class: 'btn-primaire', type: 'submit'}, 'Enregistrer');
  let feuille;
  const form = el('form', {class: 'formulaire', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const r = champ.valider();
    if (!r.ok) return;
    bouton.disabled = true;
    try {
      await confirmerMontant(ligne, r.valeur);
      feuille.fermer();
      toast('Montant enregistré');
      await recharger();
    } catch (err) {
      message.textContent = err.message;
      bouton.disabled = false;
    }
  }},
  champ.element,
  el('p', {class: 'attenue', style: {margin: 0}}, 'Prérempli avec le dernier montant saisi.'),
  message, bouton,
  el('button', {class: 'btn-texte', type: 'button', onclick: () => { feuille.fermer(); ouvrirEdition(ligne); }},
    'Modifier la charge'));
  feuille = ouvrirFeuille(form, {titre: `${ligne.icone ?? '📌'} ${ligne.libelle}`});
  champ.input.focus();
  champ.input.select();
}

function ouvrirEdition(ligne) {
  let icone = ligne?.icone ?? '💳';
  let payeur = ligne?.membre_id ?? null;
  const libelle = el('input', {class: 'champ', id: 'recurrente-libelle', value: ligne?.libelle ?? '',
    autocomplete: 'off', required: true, placeholder: 'Ex. : crédit voiture'});
  const montant = champMontant({id: 'recurrente-montant', etiquette: 'Montant ce mois-ci', valeur: ligne?.montant ?? null});
  const variable = caseACocher({etiquette: 'Le montant change chaque mois', valeur: ligne?.variable ?? false});
  const prelevee = caseACocher({etiquette: 'Déjà prélevée quand le solde a été saisi', valeur: ligne?.dans_solde ?? false});
  const message = el('p', {class: 'message-erreur', 'aria-live': 'polite'});
  const icones = el('div', {class: 'grille-choix icones'}, ICONES.map((i) =>
    el('button', {type: 'button', 'aria-pressed': String(i === icone), 'aria-label': `Icône ${i}`, onclick: (e) => {
      icone = i;
      for (const b of icones.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
    }}, i)));
  const payeurs = el('div', {class: 'segment', role: 'group', 'aria-label': 'Payée par'},
    [{id: null, nom: 'Commune'}, ...etat.membres.map((m) => ({id: m.id, nom: m.prenom}))].map((c) =>
      el('button', {type: 'button', 'aria-pressed': String(c.id === payeur), onclick: (e) => {
        payeur = c.id;
        for (const b of payeurs.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
      }}, c.nom)));

  let feuille;
  const executer = async (bouton, action, succes) => {
    bouton.disabled = true;
    message.textContent = '';
    try {
      await action();
      feuille.fermer();
      toast(succes);
      await recharger();
    } catch (e) {
      message.textContent = e.message;
      bouton.disabled = false;
    }
  };

  const enregistrer = el('button', {class: 'btn-primaire', type: 'submit'}, ligne ? 'Enregistrer' : 'Ajouter');
  const form = el('form', {class: 'formulaire', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const m = montant.valider();
    if (!libelle.value.trim()) { message.textContent = 'Indique un libellé'; return; }
    if (!m.ok) return;
    const champs = {libelle: libelle.value.trim(), icone, montant: m.valeur, variable: variable.lire(), membre_id: payeur,
      dans_solde: prelevee.lire()};
    executer(enregistrer,
      () => (ligne ? modifierRecurrente(ligne, champs) : ajouterRecurrente(etat.foyer.id, etat.donnees.mois.id, champs)),
      ligne ? 'Charge modifiée' : 'Charge ajoutée');
  }},
  el('div', {}, el('label', {class: 'etiquette', for: 'recurrente-libelle'}, 'Libellé'), libelle),
  montant.element,
  el('div', {}, el('span', {class: 'etiquette'}, 'Payée par'), payeurs),
  variable.element,
  el('p', {class: 'attenue', style: {margin: 0}},
    'Nourrice, électricité… : chaque nouveau mois, le dernier montant est proposé et tu le confirmes.'),
  el('div', {}, el('span', {class: 'etiquette'}, 'Icône'), icones),
  el('details', {class: 'repliable', open: Boolean(ligne?.dans_solde)},
    el('summary', {}, 'Déjà prélevée ?'),
    prelevee.element,
    el('p', {class: 'attenue', style: {margin: 0}},
      "Cochée, la charge est déjà comprise dans un solde : elle n'est pas retirée une 2e fois (ce mois seulement).")),
  message,
  enregistrer);

  const actions = ligne ? el('div', {class: 'actions'},
    el('button', {class: 'btn-secondaire', type: 'button', onclick: (e) =>
      executer(e.currentTarget, () => retirerDuMois(ligne.id), 'Retirée de ce mois')}, 'Retirer de ce mois seulement'),
    el('button', {class: 'btn-danger', type: 'button', onclick: (e) => {
      if (!confirm(`Supprimer « ${ligne.libelle} » de ce mois et des mois suivants ?`)) return;
      executer(e.currentTarget, () => supprimerRecurrente(ligne), 'Charge supprimée');
    }}, 'Supprimer la charge')) : null;

  feuille = ouvrirFeuille(el('div', {}, form, actions), {titre: ligne ? 'Modifier la charge' : 'Nouvelle charge'});
  if (!ligne) libelle.focus();
}

// ── Revue par swipe ────────────────────────────────────────────────────

function commencerRevue() {
  revue = {
    moisId: etat.donnees.mois.id,
    lignes: [...etat.donnees.recurrentes],
    index: 0,
    historique: [],   // {action: 'garder'|'retirer', ligne}
    occupe: false,
  };
}

function terminerRevue(conteneur) {
  const retirees = revue.historique.filter((h) => h.action === 'retirer').length;
  revue = null;
  toast(retirees ? `Revue terminée · ${retirees} charge(s) retirée(s) de ce mois` : 'Revue terminée');
  conteneur.replaceChildren();
  rendreListe(conteneur);
}

function rendreRevue(conteneur) {
  if (revue.index >= revue.lignes.length) {
    terminerRevue(conteneur);
    return;
  }
  boutonAjout(false);
  const ligne = revue.lignes[revue.index];
  const qui = prenomDe(ligne.membre_id);
  const carte = el('div', {class: 'carte-swipe', role: 'group', 'aria-label': `${ligne.libelle}, ${formatEUR(Number(ligne.montant))}`},
    el('div', {class: 'emoji', 'aria-hidden': 'true'}, ligne.icone ?? '📌'),
    el('h2', {style: {margin: 0}}, ligne.libelle),
    qui ? el('div', {class: 'attenue'}, `Perso · ${qui}`) : null,
    ligne.variable ? null : el('div', {class: 'montant'}, formatEUR(Number(ligne.montant))));

  // Montant : à saisir pour une charge variable ; modifiable sur demande pour une charge fixe.
  // Il est enregistré en gardant la charge.
  const champ = champMontant({id: 'revue-montant', etiquette: ligne.variable ? 'Montant ce mois-ci' : 'Nouveau montant',
    valeur: ligne.montant, grand: true});
  const blocMontant = el('div', {hidden: !ligne.variable}, champ.element,
    ligne.variable ? null : el('p', {class: 'attenue', style: {margin: 0}}, 'Vaut aussi pour les mois suivants.'));
  const btnModifier = ligne.variable ? null : el('button', {class: 'btn-texte', type: 'button', onclick: () => {
    blocMontant.hidden = false;
    btnModifier.hidden = true;
    champ.input.focus();
    champ.input.select();
  }}, 'Modifier le montant');
  // Avec un solde saisi, on note si la charge en est déjà sortie (pour ne pas la retirer deux fois)
  const avecSolde = etat.donnees.membresMois.some((m) => m.solde != null);
  const prelevee = avecSolde
    ? caseACocher({etiquette: 'Déjà prélevée (comprise dans le solde)', valeur: Boolean(ligne.dans_solde)})
    : null;

  const decider = async (action) => {
    if (revue.occupe) return;
    let montant = null;
    if (action === 'garder' && !blocMontant.hidden) {
      const r = champ.valider();
      if (!r.ok) { champ.input.focus(); return; }
      montant = r.valeur;
    }
    const dansSolde = prelevee ? prelevee.lire() : Boolean(ligne.dans_solde);
    // Une charge variable est toujours enregistrée (elle n'est plus « à confirmer »)
    const montantChange = montant != null && (ligne.variable || montant !== Number(ligne.montant));
    const aEnregistrer = action === 'garder' && (montantChange || dansSolde !== Boolean(ligne.dans_solde));
    revue.occupe = true;
    carte.style.transition = 'transform 0.3s ease';
    carte.style.transform = `translate(${action === 'garder' ? '' : '-'}150vw, 0) rotate(${action === 'garder' ? 20 : -20}deg)`;
    try {
      if (action === 'retirer') await retirerDuMois(ligne.id);
      if (aEnregistrer) {
        await modifierRecurrente(ligne, {libelle: ligne.libelle, icone: ligne.icone, montant: montant ?? ligne.montant,
          variable: ligne.variable, membre_id: ligne.membre_id, dans_solde: dansSolde});
      }
      revue.historique.push({action, ligne});
      revue.index += 1;
    } catch (e) {
      toast(e.message, {type: 'erreur'});
    }
    revue.occupe = false;
    setTimeout(() => {
      if (!revue) return;
      conteneur.replaceChildren();
      rendreRevue(conteneur);
    }, 250);
    if (action === 'retirer' || aEnregistrer) recharger().catch(() => {});
  };

  const annuler = async () => {
    if (revue.occupe || !revue.historique.length) return;
    revue.occupe = true;
    const dernier = revue.historique.at(-1);
    try {
      if (dernier.action === 'retirer') await restaurerDansMois(etat.foyer.id, revue.moisId, dernier.ligne);
      revue.historique.pop();
      revue.index -= 1;
    } catch (e) {
      toast(e.message, {type: 'erreur'});
    }
    revue.occupe = false;
    conteneur.replaceChildren();
    rendreRevue(conteneur);
    recharger().catch(() => {});
  };

  brancherSwipe(carte, decider);

  conteneur.append(
    el('div', {class: 'entete-vue'},
      el('h1', {}, 'Revue des charges'),
      el('span', {class: 'pastille', 'aria-live': 'polite'}, `${revue.index + 1} / ${revue.lignes.length}`)),
    el('p', {class: 'attenue'}, 'Cette charge tombe-t-elle ce mois-ci ? Glisse à droite pour la garder, à gauche pour la retirer de ce mois.'),
    el('div', {class: 'zone-swipe'}, carte),
    ligne.variable ? null : el('div', {class: 'guides-swipe'},
      el('span', {class: 'gauche'}, '← Retirer du mois'),
      el('span', {class: 'droite'}, 'Garder →')),
    blocMontant,
    btnModifier,
    prelevee?.element,
    el('div', {class: 'rangee'},
      el('button', {class: 'btn-danger', type: 'button', onclick: () => decider('retirer')}, '✕ Retirer'),
      el('button', {class: 'btn-primaire', type: 'button', onclick: () => decider('garder')}, '✓ Garder')),
    el('div', {class: 'rangee', style: {marginTop: '8px'}},
      el('button', {class: 'btn-texte', type: 'button', disabled: !revue.historique.length, onclick: annuler,
        'aria-label': 'Annuler le dernier choix'}, '↩ Annuler'),
      el('button', {class: 'btn-texte', type: 'button', onclick: () => terminerRevue(conteneur)}, 'Terminer')));
}

// Glisser au doigt (ou à la souris) : au-delà de 100 px, la décision est prise
function brancherSwipe(carte, decider) {
  let depart = null;

  carte.addEventListener('pointerdown', (e) => {
    depart = e.clientX;
    carte.setPointerCapture(e.pointerId);
    carte.style.transition = 'none';
  });
  carte.addEventListener('pointermove', (e) => {
    if (depart == null) return;
    const dx = e.clientX - depart;
    carte.style.transform = `translate(${dx}px, 0) rotate(${dx * 0.05}deg)`;
    carte.classList.toggle('vers-droite', dx > 50);
    carte.classList.toggle('vers-gauche', dx < -50);
  });
  const remettre = () => {
    depart = null;
    carte.style.transition = 'transform 0.3s ease';
    carte.style.transform = 'translate(0, 0) rotate(0deg)';
    carte.classList.remove('vers-droite', 'vers-gauche');
  };
  carte.addEventListener('pointerup', (e) => {
    if (depart == null) return;
    const dx = e.clientX - depart;
    if (dx > SEUIL_SWIPE) { depart = null; decider('garder'); }
    else if (dx < -SEUIL_SWIPE) { depart = null; decider('retirer'); }
    else remettre();
  });
  // Geste interrompu (défilement vertical, appel…) : on ne décide rien
  carte.addEventListener('pointercancel', remettre);
}
