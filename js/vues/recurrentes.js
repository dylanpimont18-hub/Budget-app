// Onglet Récurrentes : charges fixes du mois et revue de début de mois par swipe.
import {ajouterRecurrente, modifierRecurrente, marquerPrelevee, retirerDuMois, restaurerDansMois, supprimerRecurrente}
  from '../db.js';
import {etat, recharger} from '../etat.js';
import {formatEUR, libelleMois} from '../calc.js';
import {el, ajouter, ouvrirFeuille, toast, champMontant, caseACocher} from '../ui.js';

const ICONES = ['🏡', '🏦', '⚡', '💧', '🛡️', '📱', '👶', '🍽️', '🧾', '🚗', '💡', '📺', '🏋️', '🐾', '💳', '📦'];
const SEUIL_SWIPE = 100;

// Session de revue, conservée entre deux rendus (le temps réel re-rend l'onglet)
let revue = null;

const enLectureSeule = () => etat.moisCle !== etat.moisCourantCle;

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

// ── Liste ──────────────────────────────────────────────────────────────

function rendreListe(conteneur) {
  const {recurrentes} = etat.donnees;
  const lectureSeule = enLectureSeule();
  const total = recurrentes.reduce((t, r) => t + Number(r.montant), 0);

  ajouter(conteneur, [
    el('div', {class: 'entete-vue'},
      el('h1', {}, 'Récurrentes'),
      el('span', {class: 'total-entete montant'}, formatEUR(total))),
    el('p', {class: 'attenue'},
      `Charges fixes communes · ${libelleMois(etat.moisCle)}`, lectureSeule ? ' · lecture seule' : ''),
    recurrentes.length
      ? el('ul', {class: 'liste'}, recurrentes.map((r) => el('li', {},
          el(lectureSeule ? 'div' : 'button', {class: 'ligne', type: lectureSeule ? null : 'button',
            onclick: lectureSeule ? null : () => ouvrirEdition(r)},
            el('span', {class: 'ligne-icone', 'aria-hidden': 'true'}, r.icone ?? '📌'),
            el('span', {class: 'ligne-texte'}, el('div', {class: 'ligne-titre'}, r.libelle),
              r.dans_solde ? el('div', {class: 'ligne-sous'}, 'Déjà prélevée') : null),
            el('span', {class: 'ligne-montant montant'}, formatEUR(Number(r.montant)))))))
      : el('p', {class: 'vide-liste'}, 'Aucune charge fixe ce mois-ci.'),
    lectureSeule ? null : el('div', {class: 'actions'},
      el('button', {class: 'btn-secondaire', type: 'button', onclick: () => ouvrirEdition(null)}, '+ Ajouter une charge'),
      recurrentes.length
        ? el('button', {class: 'btn-texte', type: 'button', onclick: () => {
            commencerRevue();
            conteneur.replaceChildren();
            rendreRevue(conteneur);
          }},
            'Revoir les charges')
        : null)]);
}

function ouvrirEdition(ligne) {
  let icone = ligne?.icone ?? ICONES[0];
  const libelle = el('input', {class: 'champ', id: 'recurrente-libelle', value: ligne?.libelle ?? '',
    autocomplete: 'off', required: true});
  const montant = champMontant({id: 'recurrente-montant', etiquette: 'Montant mensuel', valeur: ligne?.montant ?? null});
  const prelevee = caseACocher({etiquette: 'Déjà prélevée quand le solde a été saisi', valeur: ligne?.dans_solde ?? false});
  const message = el('p', {class: 'message-erreur', 'aria-live': 'polite'});
  const icones = el('div', {class: 'grille-choix icones'}, ICONES.map((i) =>
    el('button', {type: 'button', 'aria-pressed': String(i === icone), 'aria-label': `Icône ${i}`, onclick: (e) => {
      icone = i;
      for (const b of icones.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
    }}, i)));

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
    const champs = {libelle: libelle.value.trim(), icone, montant: m.valeur};
    executer(enregistrer,
      async () => {
        if (!ligne) return ajouterRecurrente(etat.foyer.id, etat.donnees.mois.id, {...champs, dans_solde: prelevee.lire()});
        await modifierRecurrente(ligne, champs);
        if (prelevee.lire() !== Boolean(ligne.dans_solde)) await marquerPrelevee(ligne.id, prelevee.lire());
      },
      ligne ? 'Charge modifiée' : 'Charge ajoutée');
  }},
  el('div', {}, el('label', {class: 'etiquette', for: 'recurrente-libelle'}, 'Libellé'), libelle),
  montant.element,
  el('div', {}, el('span', {class: 'etiquette'}, 'Icône'), icones),
  prelevee.element,
  el('p', {class: 'attenue', style: {margin: 0}},
    "Cochée, la charge est déjà comprise dans un solde : elle n'est pas retirée une 2e fois (ce mois seulement). "
    + 'Le reste de la modification vaut aussi pour les mois suivants.'),
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
  const ligne = revue.lignes[revue.index];
  const carte = el('div', {class: 'carte-swipe', role: 'group', 'aria-label': `${ligne.libelle}, ${formatEUR(Number(ligne.montant))}`},
    el('div', {class: 'emoji', 'aria-hidden': 'true'}, ligne.icone ?? '📌'),
    el('h2', {style: {margin: 0}}, ligne.libelle),
    el('div', {class: 'montant'}, formatEUR(Number(ligne.montant))));

  const decider = async (action) => {
    if (revue.occupe) return;
    revue.occupe = true;
    carte.style.transition = 'transform 0.3s ease';
    carte.style.transform = `translate(${action === 'garder' ? '' : '-'}150vw, 0) rotate(${action === 'garder' ? 20 : -20}deg)`;
    try {
      if (action === 'retirer') await retirerDuMois(ligne.id);
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
    if (action === 'retirer') recharger().catch(() => {});
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
    el('p', {class: 'attenue'}, 'Glisse à droite pour garder la charge ce mois-ci, à gauche pour la retirer de ce mois.'),
    el('div', {class: 'zone-swipe'}, carte),
    el('div', {class: 'guides-swipe'},
      el('span', {class: 'gauche'}, '← Retirer du mois'),
      el('span', {class: 'droite'}, 'Garder →')),
    el('div', {class: 'rangee'},
      el('button', {class: 'btn-danger', type: 'button', onclick: () => decider('retirer')}, '✕ Retirer'),
      el('button', {class: 'btn-primaire', type: 'button', onclick: () => decider('garder')}, '✓ Garder')),
    el('div', {class: 'rangee', style: {marginTop: '8px'}},
      el('button', {class: 'btn-texte', type: 'button', disabled: !revue.historique.length, onclick: annuler,
        'aria-label': 'Annuler le dernier swipe'}, '↩ Annuler'),
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
