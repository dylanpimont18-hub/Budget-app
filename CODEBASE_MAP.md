# CODEBASE_MAP — Budget familial

PWA statique (GitHub Pages) en modules ES natifs, données dans Supabase (projet `budget-familial`, eu-west-3).
Tests : `npm test` (logique pure) et `supabase/tests/rls_et_rpc.sql` (base, à lancer dans le SQL Editor).

## CLAUDE.md
Guide pour Claude Code : architecture, commandes, conventions.

## index.html
Coquille : `#vue`, barre d'onglets `#onglets`, bouton `#btn-ajout-rapide`, conteneur `#feuilles`, bandeau `#hors-ligne`.

## style.css
Jetons terracotta (`:root`) et composants : cartes, jauges, listes, champs, boutons, onglets, feuille, swipe, graphiques, bandeaux.

## manifest.json
Métadonnées PWA « Budget familial » (couleurs crème / terracotta), icônes 192 et 512.

## icones/
Icônes de l'app (favicon, apple-touch-icon 180, 192, 512) : € crème sur terracotta.

## package.json
Script `npm test` uniquement (aucune dépendance).

## js/config.js
URL et clé publique (anon) du projet Supabase.

## js/calc.js
Fonctions pures de calcul, sans DOM ni réseau.
- parseMontant(saisie, {negatif}) — lit un montant au clavier français
- formatEUR(n, {signe}) — formate en euros fr-FR
- cleMois(date) — clé 'YYYY-MM' en heure locale
- decalerMois(cle, n) — avance ou recule de n mois
- nbMois(debut, fin) — nombre de mois, bornes incluses
- libelleMois(cle) — « octobre 2026 »
- niveauBudget(budget, depense) — vide / ok / alerte / dépassé
- syntheseMois({membres, revenus, recurrentes, budgets, depenses, versements}) — disponible, à venir, reste libre, sans doublon
- bilanMois({budgets, depenses}) — prévu, dépensé, dépassements d'un mois
- depensesParCategorie(depenses) — total et part par membre
- totalParMembre(depenses) — total dépensé par membre
- topPostes(postes, n) — n plus gros postes + « Autres »
- effortMensuel(cible, debut, fin) — cible divisée par nombre de mois
- cibleDepuisMensuel(mensuel, nbMois) — cible depuis un montant mensuel
- suiviObjectif(objectif, versements, moisCourant) — versé, prévu (mois en cours dû après versement), statut

## js/db.js
Client Supabase et toutes les requêtes ; lève des erreurs en français.
- session() / surAuth(cb) — session courante, écoute de l'auth
- connecter / inscrire / deconnecter — email et mot de passe
- demanderReinitialisation(email) / changerMotDePasse(mdp) — mot de passe oublié
- chargerFoyer() — foyer, membres et membre courant
- creerFoyer(prenom) / rejoindreFoyer(code, prenom) — RPC foyer
- chargerMois(foyerId, cle) — mois, revenus, récurrentes, budgets, dépenses, versements
- listerMois(foyerId) — clés des mois ouverts, décroissantes
- chargerCategories(foyerId) — catégories actives et inactives
- chargerObjectifs(foyerId) — objectifs et tous les versements
- ecouter(foyerId, cb) — abonnement Realtime aux tables publiées
- ouvrirMois(cle, membres, revenus, versements, prelevees) — RPC d'ouverture, renvoie {mois_id, cree}
- chargerRecurrentesModele(foyerId) — charges fixes actives du modèle
- ajouterRecurrente / modifierRecurrente — mois et modèle (variable, payeur, déjà prélevée)
- confirmerMontant(ligneMois, montant) — montant réel d'une charge variable
- retirerDuMois / restaurerDansMois — retrait du mois seulement, annulation
- supprimerRecurrente(ligne) — retire du mois, désactive le modèle
- ajouterRevenu / modifierRevenu / supprimerRevenu — autres revenus du mois
- ajouterDepense / modifierDepense / supprimerDepense — dépenses ponctuelles
- modifierBudget(foyerId, moisId, categorieId, montant) — budget du mois et défaut
- creerCategorie / modifierCategorie / activerCategorie — catégories (jamais supprimées)
- modifierProfil(membreId, {prenom, salaire_defaut}) — profil du membre
- modifierMoisMembre(foyerId, moisId, membreId, champs) — part du mois d'un membre (upsert partiel)
- creerObjectif / modifierObjectif / archiverObjectif — objectifs d'épargne
- ajouterVersement / supprimerVersement — versements (retrait = négatif)

## js/etat.js
Store : état courant, notification des vues, rechargement et temps réel.
- abonner(fn) / notifier() — abonnement des vues
- recharger() — recharge tout, ignore les réponses périmées
- changerMois(cle) — change le mois affiché
- rechargerEnFond() — recharge, erreur en toast
- demarrerTempsReel() / arreterTempsReel() — Realtime avec anti-rebond 300 ms

## js/ui.js
Helpers DOM (jamais d'innerHTML pour des données utilisateur).
- el(tag, attrs, ...enfants) — crée un élément
- ajouter(parent, enfants) — ajoute en aplatissant, ignore null
- ouvrirFeuille(contenu, {titre}) — feuille modale du bas
- toast(message, {type}) — message temporaire
- versSaisie(n) — nombre au format de saisie
- champMontant(options) — champ montant validé en direct
- choixOuiNon({etiquette, valeur, oui, non, surChange}) — segment oui / non sans défaut
- caseACocher({etiquette, detail, valeur, surChange}) — case pleine largeur

## js/app.js
Démarrage et routage : connexion → foyer → ouverture du mois → onglets ; redémarre si le mois a changé.
- afficherOnglet(nom, options) — affiche un onglet
- seDeconnecter() — déconnexion avec message d'erreur

## js/vues/connexion.js
Connexion / inscription, création ou adhésion au foyer.
- rendreConnexion(conteneur, {apres}) — formulaire compatible trousseau iCloud, mot de passe oublié
- rendreNouveauMotDePasse(conteneur, {apres}) — retour du lien de réinitialisation
- rendreChoixFoyer(conteneur, {apres}) — créer ou rejoindre un foyer
- copier(texte) — copie dans le presse-papiers

## js/vues/ouverture.js
Ouverture du mois : sa propre part (salaire, solde), revenus déjà reçus, versements (les charges passent ensuite en revue).
- rendreOuverture(conteneur, {apres}) — formulaire d'ouverture du mois

## js/vues/recurrentes.js
Onglet Récurrentes : charges communes / perso, variables à confirmer ; revue par swipe (montant modifiable, déjà prélevée).
- rendreRecurrentes(conteneur, {revue}) — liste groupée ou revue par swipe
- ouvrirConfirmation(ligne) — saisir le montant d'une charge variable

## js/vues/depenses.js
Onglet Dépenses, historique mensuel, formulaire de dépense partagé.
- formulaireDepense({depense, onValider}) — saisie / modification d'une dépense
- selecteurMois() — navigation ‹ mois › entre mois ouverts
- rendreDepenses(conteneur) — journal par date ou catégorie
- categorieDe(id) / aujourdhui() — utilitaires partagés

## js/vues/ajout-rapide.js
Bouton « + » flottant.
- initAjoutRapide(bouton) — ouvre la feuille de saisie rapide

## js/vues/tableau.js
Onglet Budget : disponible et reste libre, bilan des mois passés, budgets, par personne, graphiques SVG.
- rendreTableau(conteneur) — tableau de bord du mois affiché
- bandeaux() / confirmerSalaire(membre, mm) — part à remplir, charge à confirmer, salaire reçu ?
- editerMembre(membre, mm) — salaire, solde daté, déjà dans le solde
- bilan() — bilan d'un mois passé (remplace la prévision)

## js/vues/reglages.js
Feuilles ouvertes depuis l'onglet Budget.
- ouvrirRevenus() — autres revenus du mois
- ouvrirCategories() — créer, renommer, désactiver
- ouvrirProfil() — prénom et salaire habituel

## js/vues/objectifs.js
Onglet Objectifs : suivi, versements / retraits, archives.
- rendreObjectifs(conteneur) — liste, création, détail
- estArchive(objectif) — archivé, atteint ou échu

## supabase/migrations/001_schema.sql
Tables scopées par `foyer_id`, contraintes, index, publication Realtime.

## supabase/migrations/002_rls.sql
RLS par foyer via `est_membre(foyer_id)` ; membres : lecture + mise à jour de sa ligne.

## supabase/migrations/003_rpc.sql
RPC `security definer`.
- creer_foyer(p_prenom) — foyer, code, données initiales
- rejoindre_foyer(p_code, p_prenom) — adhésion par code
- ouvrir_mois(p_cle, p_membres, p_revenus, p_versements) — mois idempotent depuis le modèle

## supabase/migrations/004_temps_reel.sql
Publie toutes les tables partagées du foyer dans Realtime.

## supabase/migrations/005_solde_dans_calcul.sql
`mois_membres.salaire_dans_solde` (calcul) et `salaire_recu` (affichage) ; `ouvrir_mois` les renseigne.

## supabase/migrations/006_aucun_doublon.sql
`dans_solde` sur revenus et charges du mois, `solde_le` et `renseigne` sur `mois_membres` ; `ouvrir_mois` (5 paramètres) renvoie `{mois_id, cree}`.

## supabase/migrations/007_charges_variables_perso.sql
`variable` et `membre_id` sur les récurrentes (modèle et mois), `a_confirmer` sur le mois ; `ouvrir_mois` les recopie.

## supabase/tests/rls_et_rpc.sql
Test SQL (begin … rollback) : RLS, RPC, mois sautés, contraintes.

## tests/calc.test.js
Tests `node:test` de `js/calc.js`.
