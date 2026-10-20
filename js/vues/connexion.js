// Connexion / inscription, puis création ou adhésion à un foyer.
import {connecter, inscrire, deconnecter, creerFoyer, rejoindreFoyer, demanderReinitialisation, changerMotDePasse}
  from '../db.js';
import {el, toast} from '../ui.js';

export function rendreConnexion(conteneur, {apres}) {
  let mode = 'connexion';

  const email = el('input', {class: 'champ', type: 'email', name: 'email', id: 'email', required: true,
    autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', inputmode: 'email'});
  const mdp = el('input', {class: 'champ', type: 'password', name: 'password', id: 'mot-de-passe', required: true,
    autocomplete: 'current-password'});
  const message = el('p', {class: 'message-erreur', 'aria-live': 'polite'});
  const valider = el('button', {class: 'btn-primaire', type: 'submit'}, 'Se connecter');
  const aide = el('p', {class: 'attenue'});

  const oubli = el('button', {class: 'btn-texte', type: 'button', onclick: async () => {
    message.textContent = '';
    const adresse = email.value.trim();
    if (!adresse) { message.textContent = 'Indique ton email ci-dessus, puis touche « Mot de passe oublié »'; return; }
    oubli.disabled = true;
    try {
      await demanderReinitialisation(adresse);
      message.textContent = 'Lien envoyé : ouvre le mail reçu pour choisir un nouveau mot de passe.';
    } catch (err) {
      message.textContent = err.message;
    } finally {
      oubli.disabled = false;
    }
  }}, 'Mot de passe oublié ?');
  const btnConnexion = el('button', {type: 'button', onclick: () => changerMode('connexion')}, 'Se connecter');
  const btnInscription = el('button', {type: 'button', onclick: () => changerMode('inscription')}, 'Créer un compte');

  function changerMode(nouveau) {
    mode = nouveau;
    const inscription = mode === 'inscription';
    btnConnexion.setAttribute('aria-pressed', String(!inscription));
    btnInscription.setAttribute('aria-pressed', String(inscription));
    mdp.autocomplete = inscription ? 'new-password' : 'current-password';
    mdp.minLength = inscription ? 8 : 0;
    valider.textContent = inscription ? 'Créer mon compte' : 'Se connecter';
    aide.textContent = inscription ? '8 caractères minimum.' : '';
    oubli.hidden = inscription;
    message.textContent = '';
  }

  async function soumettre(e) {
    e.preventDefault();
    message.textContent = '';
    const adresse = email.value.trim();
    if (!adresse || !mdp.value) {
      message.textContent = 'Indique ton email et ton mot de passe';
      return;
    }
    if (mode === 'inscription' && mdp.value.length < 8) {
      message.textContent = 'Le mot de passe doit faire au moins 8 caractères';
      return;
    }
    valider.disabled = true;
    try {
      if (mode === 'connexion') {
        await connecter(adresse, mdp.value);
        apres();
      } else {
        const s = await inscrire(adresse, mdp.value);
        if (s) {
          apres();
        } else {
          changerMode('connexion');
          message.textContent = 'Compte créé. Confirme ton email (lien reçu par mail), puis connecte-toi.';
        }
      }
    } catch (err) {
      message.textContent = err.message;
    } finally {
      valider.disabled = false;
    }
  }

  changerMode('connexion');
  conteneur.append(
    el('section', {class: 'ecran-connexion'},
      el('h1', {}, 'Budget familial'),
      el('p', {class: 'accroche'}, 'Le budget du foyer, partagé à deux.'),
      el('div', {class: 'segment', style: {marginBottom: '16px'}}, btnConnexion, btnInscription),
      el('form', {class: 'formulaire', onsubmit: soumettre, novalidate: true},
        el('div', {}, el('label', {class: 'etiquette', for: 'email'}, 'Email'), email),
        el('div', {}, el('label', {class: 'etiquette', for: 'mot-de-passe'}, 'Mot de passe'), mdp, aide),
        message,
        valider),
      oubli));
}

// Après le lien « mot de passe oublié » : la session est ouverte, on choisit le nouveau mot de passe
export function rendreNouveauMotDePasse(conteneur, {apres}) {
  const mdp = el('input', {class: 'champ', type: 'password', id: 'nouveau-mdp', autocomplete: 'new-password', minlength: '8'});
  const message = el('p', {class: 'message-erreur', 'aria-live': 'polite'});
  const valider = el('button', {class: 'btn-primaire', type: 'submit'}, 'Enregistrer');
  conteneur.append(el('section', {class: 'ecran-connexion'},
    el('h1', {}, 'Nouveau mot de passe'),
    el('form', {class: 'formulaire', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      message.textContent = '';
      if (mdp.value.length < 8) { message.textContent = 'Le mot de passe doit faire au moins 8 caractères'; return; }
      valider.disabled = true;
      try {
        await changerMotDePasse(mdp.value);
        toast('Mot de passe modifié');
        apres();
      } catch (err) {
        message.textContent = err.message;
        valider.disabled = false;
      }
    }},
    el('div', {}, el('label', {class: 'etiquette', for: 'nouveau-mdp'}, 'Nouveau mot de passe'), mdp,
      el('p', {class: 'attenue'}, '8 caractères minimum.')),
    message, valider)));
  mdp.focus();
}

export function rendreChoixFoyer(conteneur, {apres}) {
  const section = el('section', {class: 'ecran-connexion'});

  // Créer
  const prenomCreer = el('input', {class: 'champ', id: 'prenom-creer', autocomplete: 'given-name', required: true});
  const msgCreer = el('p', {class: 'message-erreur', 'aria-live': 'polite'});
  const btnCreer = el('button', {class: 'btn-primaire', type: 'submit'}, 'Créer notre foyer');

  async function creer(e) {
    e.preventDefault();
    msgCreer.textContent = '';
    if (!prenomCreer.value.trim()) { msgCreer.textContent = 'Indique ton prénom'; return; }
    btnCreer.disabled = true;
    try {
      const foyer = await creerFoyer(prenomCreer.value.trim());
      afficherCode(foyer.code_invitation);
    } catch (err) {
      msgCreer.textContent = err.message;
      btnCreer.disabled = false;
    }
  }

  // Rejoindre
  const code = el('input', {class: 'champ', id: 'code', maxlength: '6', autocomplete: 'off', autocapitalize: 'characters',
    spellcheck: 'false', style: {textTransform: 'uppercase', letterSpacing: '0.2em'}});
  const prenomRejoindre = el('input', {class: 'champ', id: 'prenom-rejoindre', autocomplete: 'given-name'});
  const msgRejoindre = el('p', {class: 'message-erreur', 'aria-live': 'polite'});
  const btnRejoindre = el('button', {class: 'btn-secondaire', type: 'submit'}, 'Rejoindre');

  async function rejoindre(e) {
    e.preventDefault();
    msgRejoindre.textContent = '';
    if (code.value.trim().length !== 6) { msgRejoindre.textContent = 'Le code fait 6 caractères'; return; }
    if (!prenomRejoindre.value.trim()) { msgRejoindre.textContent = 'Indique ton prénom'; return; }
    btnRejoindre.disabled = true;
    try {
      await rejoindreFoyer(code.value.trim(), prenomRejoindre.value.trim());
      apres();
    } catch (err) {
      msgRejoindre.textContent = err.message;
      btnRejoindre.disabled = false;
    }
  }

  function afficherCode(valeur) {
    section.replaceChildren(
      el('h1', {}, 'Foyer créé'),
      el('div', {class: 'carte'},
        el('p', {class: 'attenue', style: {textAlign: 'center', margin: 0}}, 'Ton code d\'invitation'),
        el('div', {class: 'code-invitation'}, valeur),
        el('button', {class: 'btn-secondaire', type: 'button', onclick: () => copier(valeur)}, 'Copier le code'),
        el('p', {class: 'attenue', style: {textAlign: 'center'}},
          'L\'autre membre le saisit dans « Rejoindre avec un code ». Il reste visible dans l\'onglet Budget.')),
      el('button', {class: 'btn-primaire', type: 'button', onclick: apres}, 'Continuer'));
  }

  section.append(
    el('h1', {}, 'Ton foyer'),
    el('p', {class: 'accroche'}, 'Crée le foyer, ou rejoins celui de l\'autre membre avec son code.'),
    el('form', {class: 'carte formulaire', onsubmit: creer},
      el('h2', {}, 'Créer notre foyer'),
      el('div', {}, el('label', {class: 'etiquette', for: 'prenom-creer'}, 'Ton prénom'), prenomCreer),
      msgCreer, btnCreer),
    el('form', {class: 'carte formulaire', onsubmit: rejoindre},
      el('h2', {}, 'Rejoindre avec un code'),
      el('div', {}, el('label', {class: 'etiquette', for: 'code'}, 'Code d\'invitation'), code),
      el('div', {}, el('label', {class: 'etiquette', for: 'prenom-rejoindre'}, 'Ton prénom'), prenomRejoindre),
      msgRejoindre, btnRejoindre),
    el('button', {class: 'btn-texte', type: 'button', onclick: () => deconnecter().catch((e) => toast(e.message, {type: 'erreur'}))},
      'Se déconnecter'));
  conteneur.append(section);
}

export async function copier(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    toast('Code copié');
  } catch {
    toast('Copie impossible : note le code ' + texte, {type: 'erreur'});
  }
}
