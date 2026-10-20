// Onglet Objectifs : épargne par objectif, versements et retraits, archives.
import {creerObjectif, modifierObjectif, archiverObjectif, ajouterVersement, supprimerVersement} from '../db.js';
import {etat, recharger} from '../etat.js';
import {formatEUR, libelleMois, nbMois, decalerMois, effortMensuel, cibleDepuisMensuel, suiviObjectif} from '../calc.js';
import {el, ajouter, ouvrirFeuille, toast, champMontant} from '../ui.js';

const ICONES = ['🏖️', '🚗', '🏠', '🎁', '🎓', '💍', '🛟', '🎯'];
const STATUTS = {avance: 'En avance', ajour: 'À jour', retard: 'En retard', atteint: 'Atteint', echu: 'Échu'};
const FORMAT_MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;

const versementsDe = (o) => etat.donnees.versementsTous.filter((v) => v.objectif_id === o.id);
const suivi = (o) => suiviObjectif({...o, cible: Number(o.cible)}, versementsDe(o), etat.moisCourantCle);

// Atteint ou échu : rangé avec les archivés (spec §3.6)
export function estArchive(o) {
  if (o.archive) return true;
  const s = suivi(o);
  return s.statut === 'atteint' || s.echu;
}

function statutAffiche(s) {
  return s.statut !== 'atteint' && s.echu ? 'echu' : s.statut;
}

export function rendreObjectifs(conteneur) {
  const objectifs = etat.donnees.objectifs;
  const actifs = objectifs.filter((o) => !estArchive(o));
  const archives = objectifs.filter(estArchive);

  ajouter(conteneur, [
    el('div', {class: 'entete-vue'}, el('h1', {}, 'Objectifs')),
    actifs.length
      ? actifs.map(carteObjectif)
      : el('p', {class: 'vide-liste'}, 'Aucun objectif en cours. Créez-en un pour suivre votre épargne.'),
    el('button', {class: 'btn-secondaire', type: 'button', onclick: () => ouvrirFormulaire(null)}, '+ Nouvel objectif'),
    archives.length
      ? el('details', {class: 'repliable', style: {marginTop: '16px'}},
          el('summary', {}, `Archivés (${archives.length})`),
          archives.map(carteObjectif))
      : null]);
}

function carteObjectif(o) {
  const s = suivi(o);
  const statut = statutAffiche(s);
  const cible = Number(o.cible);
  return el('button', {class: 'carte', type: 'button', style: {display: 'block', width: '100%', textAlign: 'left'},
    onclick: () => ouvrirDetail(o)},
  el('div', {class: 'objectif-entete'},
    el('span', {class: 'ligne-icone', 'aria-hidden': 'true'}, o.icone ?? '🎯'),
    el('span', {class: 'ligne-texte ligne-titre'}, o.nom),
    el('span', {class: `pastille statut-${statut}`}, STATUTS[statut])),
  el('div', {class: `jauge niveau-${statut === 'retard' ? 'alerte' : statut === 'echu' ? 'depasse' : 'ok'}`,
    role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(cible), 'aria-valuenow': String(s.verse),
    'aria-label': `${o.nom} : ${formatEUR(s.verse)} sur ${formatEUR(cible)}`},
  el('span', {style: {width: `${Math.max(0, Math.min(100, s.pct))}%`}})),
  el('div', {class: 'objectif-chiffres'},
    el('span', {class: 'montant'}, `${formatEUR(s.verse)} / ${formatEUR(cible)}`),
    el('span', {}, s.echu || statut === 'atteint'
      ? `Fin ${libelleMois(o.fin)}`
      : `${s.moisRestants} mois restant${s.moisRestants > 1 ? 's' : ''} · ${formatEUR(s.effortRecalcule)}/mois`)));
}

// ── Création / modification ────────────────────────────────────────────

function ouvrirFormulaire(objectif) {
  let icone = objectif?.icone ?? ICONES[0];
  let mode = 'cible';

  const nom = el('input', {class: 'champ', id: 'objectif-nom', value: objectif?.nom ?? '', autocomplete: 'off',
    placeholder: 'Ex. : vacances d\'été'});
  const debut = el('input', {class: 'champ', id: 'objectif-debut', type: 'month', value: objectif?.debut ?? etat.moisCourantCle});
  const fin = el('input', {class: 'champ', id: 'objectif-fin', type: 'month',
    value: objectif?.fin ?? decalerMois(etat.moisCourantCle, 11)});
  const apercu = el('div', {class: 'apercu-calcul', 'aria-live': 'polite'});
  const message = el('p', {class: 'message-erreur', 'aria-live': 'polite'});

  const cible = champMontant({id: 'objectif-cible', etiquette: 'Montant cible', valeur: objectif?.cible ?? null,
    strict: true, surChange: () => calculer()});
  const mensuel = champMontant({id: 'objectif-mensuel', etiquette: 'Montant par mois', strict: true, surChange: () => calculer()});
  mensuel.element.hidden = true;

  // {ok, cible, effort, mois, erreur}
  function calculer() {
    const d = debut.value;
    const f = fin.value;
    let r;
    if (!FORMAT_MOIS.test(d) || !FORMAT_MOIS.test(f)) r = {ok: false, erreur: 'Indique le mois de début et de fin'};
    else if (f < d) r = {ok: false, erreur: 'La fin doit être après le début'};
    else {
      const mois = nbMois(d, f);
      const lu = (mode === 'cible' ? cible : mensuel).lire();
      if (!lu.ok || lu.valeur <= 0) {
        r = {ok: false, erreur: mode === 'cible' ? 'La cible doit être supérieure à 0' : 'Le montant par mois doit être supérieur à 0'};
      } else {
        const c = mode === 'cible' ? lu.valeur : cibleDepuisMensuel(lu.valeur, mois);
        r = {ok: true, cible: c, effort: effortMensuel(c, d, f), mois};
      }
    }
    apercu.textContent = r.ok
      ? (mode === 'cible'
          ? `Effort : ${formatEUR(r.effort)}/mois pendant ${r.mois} mois`
          : `Cible : ${formatEUR(r.cible)} sur ${r.mois} mois`)
      : '—';
    return r;
  }
  debut.addEventListener('input', calculer);
  fin.addEventListener('input', calculer);

  const btnMode = (m, texte) => el('button', {type: 'button', 'aria-pressed': String(mode === m), onclick: (e) => {
    mode = m;
    for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
    cible.element.hidden = mode !== 'cible';
    mensuel.element.hidden = mode !== 'mensuel';
    calculer();
  }}, texte);

  const icones = el('div', {class: 'grille-choix icones'}, ICONES.map((i) =>
    el('button', {type: 'button', 'aria-pressed': String(i === icone), 'aria-label': `Icône ${i}`, onclick: (e) => {
      icone = i;
      for (const b of icones.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
    }}, i)));

  const bouton = el('button', {class: 'btn-primaire', type: 'submit'}, objectif ? 'Enregistrer' : 'Créer l\'objectif');
  let feuille;
  const form = el('form', {class: 'formulaire', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    message.textContent = '';
    if (!nom.value.trim()) { message.textContent = 'Donne un nom à l\'objectif'; return; }
    const r = calculer();
    if (!r.ok) { message.textContent = r.erreur; return; }
    const champs = {nom: nom.value.trim(), icone, cible: r.cible, debut: debut.value, fin: fin.value};
    bouton.disabled = true;
    try {
      if (objectif) await modifierObjectif(objectif.id, champs);
      else await creerObjectif(etat.foyer.id, champs);
      feuille.fermer();
      toast(objectif ? 'Objectif modifié' : 'Objectif créé');
      await recharger();
    } catch (err) {
      message.textContent = err.message;
      bouton.disabled = false;
    }
  }},
  el('div', {}, el('label', {class: 'etiquette', for: 'objectif-nom'}, 'Nom'), nom),
  el('div', {}, el('span', {class: 'etiquette'}, 'Icône'), icones),
  el('div', {class: 'segment'}, btnMode('cible', 'Montant cible'), btnMode('mensuel', 'Par mois')),
  cible.element,
  mensuel.element,
  el('div', {class: 'rangee'},
    el('div', {}, el('label', {class: 'etiquette', for: 'objectif-debut'}, 'Début'), debut),
    el('div', {}, el('label', {class: 'etiquette', for: 'objectif-fin'}, 'Fin'), fin)),
  apercu,
  message,
  bouton);

  feuille = ouvrirFeuille(form, {titre: objectif ? 'Modifier l\'objectif' : 'Nouvel objectif'});
  calculer();
}

// ── Détail ─────────────────────────────────────────────────────────────

function ouvrirDetail(o) {
  const s = suivi(o);
  const statut = statutAffiche(s);
  const versements = versementsDe(o).slice().reverse();
  const nomMembre = (id) => etat.membres.find((m) => m.id === id)?.prenom ?? 'Commun';
  let feuille;

  const action = async (bouton, faire, succes) => {
    bouton.disabled = true;
    try {
      await faire();
      feuille.fermer();
      toast(succes);
      await recharger();
    } catch (err) {
      toast(err.message, {type: 'erreur'});
      bouton.disabled = false;
    }
  };

  const proposition = !o.archive && (statut === 'atteint' || statut === 'echu')
    ? el('p', {class: 'apercu-calcul'}, statut === 'atteint'
        ? 'Objectif atteint 🎉 Vous pouvez l\'archiver.'
        : 'L\'échéance est passée. Vous pouvez archiver cet objectif.')
    : null;

  const contenu = el('div', {class: 'formulaire'},
    el('div', {class: 'objectif-entete'},
      el('span', {class: `pastille statut-${statut}`}, STATUTS[statut]),
      el('span', {class: 'attenue'}, `${libelleMois(o.debut)} → ${libelleMois(o.fin)}`)),
    el('div', {class: 'grille-stats', style: {marginBottom: 0}},
      stat('Épargné', formatEUR(s.verse), `${s.pct.toLocaleString('fr-FR')} % de ${formatEUR(Number(o.cible))}`),
      stat('Prévu à date', formatEUR(s.prevu), `Effort initial ${formatEUR(effortMensuel(Number(o.cible), o.debut, o.fin))}/mois`),
      stat('Mois restants', String(s.moisRestants), s.moisRestants ? `${formatEUR(s.effortRecalcule)}/mois` : '—')),
    proposition,
    o.archive ? null : el('div', {class: 'rangee'},
      el('button', {class: 'btn-primaire', type: 'button', onclick: () => { feuille.fermer(); ouvrirVersement(o, 1); }}, 'Verser'),
      el('button', {class: 'btn-secondaire', type: 'button', onclick: () => { feuille.fermer(); ouvrirVersement(o, -1); }}, 'Retirer')),
    el('h3', {style: {margin: '8px 0 0'}}, 'Historique'),
    versements.length
      ? el('ul', {class: 'liste'}, versements.map((v) => el('li', {class: 'ligne'},
          el('span', {class: 'ligne-texte'},
            el('div', {class: 'ligne-titre'}, libelleMois(v.mois_cle)),
            el('div', {class: 'ligne-sous'}, nomMembre(v.membre_id))),
          el('span', {class: `ligne-montant montant ${v.montant < 0 ? 'niveau-texte-depasse' : ''}`},
            formatEUR(Number(v.montant), {signe: true})),
          el('button', {class: 'btn-icone', type: 'button', 'aria-label': 'Supprimer ce versement', onclick: (e) => {
            if (!confirm('Supprimer ce versement ?')) return;
            action(e.currentTarget, () => supprimerVersement(v.id), 'Versement supprimé');
          }}, '✕'))))
      : el('p', {class: 'attenue'}, 'Aucun versement pour l\'instant.'),
    el('div', {class: 'actions'},
      o.archive ? null : el('button', {class: 'btn-texte', type: 'button', onclick: () => { feuille.fermer(); ouvrirFormulaire(o); }},
        'Modifier l\'objectif'),
      o.archive
        ? el('button', {class: 'btn-secondaire', type: 'button', onclick: (e) =>
            action(e.currentTarget, () => modifierObjectif(o.id, {archive: false}), 'Objectif restauré')}, 'Restaurer')
        : el('button', {class: proposition ? 'btn-primaire' : 'btn-texte', type: 'button', onclick: (e) =>
            action(e.currentTarget, () => archiverObjectif(o.id), 'Objectif archivé')}, 'Archiver')));

  feuille = ouvrirFeuille(contenu, {titre: `${o.icone ?? '🎯'} ${o.nom}`});
}

function stat(etiquette, valeur, sous) {
  return el('div', {class: 'carte-stat'},
    el('div', {class: 'etiquette-stat'}, etiquette),
    el('div', {class: 'valeur-stat montant'}, valeur),
    el('div', {class: 'sous-stat'}, sous));
}

// sens : 1 = versement, -1 = retrait (enregistré en négatif)
function ouvrirVersement(o, sens) {
  let qui = null;
  const champ = champMontant({id: 'versement-montant', etiquette: sens > 0 ? 'Montant versé' : 'Montant retiré',
    strict: true, grand: true});
  const message = el('p', {class: 'message-erreur', 'aria-live': 'polite'});
  const choix = [...etat.membres.map((m) => ({id: m.id, nom: m.prenom})), {id: null, nom: 'Commun'}];
  const segment = el('div', {class: 'segment'}, choix.map((c) =>
    el('button', {type: 'button', 'aria-pressed': String(c.id === qui), onclick: (e) => {
      qui = c.id;
      for (const b of segment.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
    }}, c.nom)));
  const bouton = el('button', {class: sens > 0 ? 'btn-primaire' : 'btn-danger', type: 'submit'}, sens > 0 ? 'Verser' : 'Retirer');
  let feuille;
  const form = el('form', {class: 'formulaire', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const r = champ.valider();
    if (!r.ok) return;
    bouton.disabled = true;
    try {
      await ajouterVersement(etat.foyer.id,
        {objectif_id: o.id, mois_cle: etat.moisCourantCle, montant: sens * r.valeur, membre_id: qui});
      feuille.fermer();
      toast(sens > 0 ? `${formatEUR(r.valeur)} versés` : `${formatEUR(r.valeur)} retirés`);
      await recharger();
    } catch (err) {
      message.textContent = err.message;
      bouton.disabled = false;
    }
  }},
  champ.element,
  el('div', {}, el('span', {class: 'etiquette'}, sens > 0 ? 'Versé par' : 'Retiré par'), segment),
  el('p', {class: 'attenue', style: {margin: 0}}, `Mois : ${libelleMois(etat.moisCourantCle)}`),
  message, bouton);
  feuille = ouvrirFeuille(form, {titre: `${sens > 0 ? 'Verser' : 'Retirer'} · ${o.nom}`});
  champ.input.focus();
}
