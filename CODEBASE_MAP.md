# CODEBASE_MAP — Budget familial

PWA statique (GitHub Pages) en modules ES natifs, données dans Supabase (projet `budget-familial`, eu-west-3).
Tests : `npm test` (logique pure) et `supabase/tests/rls_et_rpc.sql` (base, à lancer dans le SQL Editor).

## CLAUDE.md
Guide pour Claude Code : architecture, commandes, conventions.

## index.html
Coquille : `#vue`, barre d'onglets `#onglets`, bouton `#btn-ajout-rapide`, conteneur `#feuilles`, bandeau `#hors-ligne`.

## style.css
Jetons terracotta (`:root`) et composants : cartes, jauges, listes, champs, boutons, onglets, feuille, swipe, graphiques.

## manifest.json
Métadonnées PWA « Budget familial » (couleurs crème / terracotta).

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
- syntheseMois({salaires, revenus, recurrentes, budgets, versements}) — cartes et reste libre
- depensesParCategorie(depenses) — total et part par membre
- totalParMembre(depenses) — total dépensé par membre
- topPostes(postes, n) — n plus gros postes + « Autres »
- effortMensuel(cible, debut, fin) — cible divisée par nombre de mois
- cibleDepuisMensuel(mensuel, nbMois) — cible depuis un montant mensuel
- suiviObjectif(objectif, versements, moisCourant) — versé, prévu, statut, mois restants

## js/db.js
Client Supabase et toutes les requêtes ; lève des erreurs en français.
- session() / surAuth(cb) — session courante, écoute de l'auth
- connecter / inscrire / deconnecter — email et mot de passe
- chargerFoyer() — foyer, membres et membre courant
- creerFoyer(prenom) / rejoindreFoyer(code, prenom) — RPC foyer
- chargerMois(foyerId, cle) — mois, revenus, récurrentes, budgets, dépenses, versements
- listerMois(foyerId) — clés des mois ouverts, décroissantes
- chargerCategories(foyerId) — catégories actives et inactives
- chargerObjectifs(foyerId) — objectifs et tous les versements
- ecouter(foyerId, cb) — abonnement Realtime aux tables publiées
- ouvrirMois(cle, membres, revenus, versements) — RPC idempotente d'ouverture
- ajouterRecurrente / modifierRecurrente — mois et modèle ensemble
- retirerDuMois / restaurerDansMois — retrait du mois seulement, annulation
- supprimerRecurrente(ligne) — retire du mois, désactive le modèle
- ajouterDepense / modifierDepense / supprimerDepense — dépenses ponctuelles
- modifierBudget(foyerId, moisId, categorieId, montant) — budget du mois et défaut
- modifierMoisMembre(foyerId, moisId, membreId, {salaire, solde}) — salaire du mois (upsert)
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

## js/app.js
Démarrage et routage : connexion → foyer → ouverture du mois → onglets ; redémarre si le mois a changé.
- afficherOnglet(nom, options) — affiche un onglet
- seDeconnecter() — déconnexion avec message d'erreur

## js/vues/connexion.js
Connexion / inscription, création ou adhésion au foyer.
- rendreConnexion(conteneur, {apres}) — formulaire compatible trousseau iCloud
- rendreChoixFoyer(conteneur, {apres}) — créer ou rejoindre un foyer
- copier(texte) — copie dans le presse-papiers

## js/vues/ouverture.js
Ouverture du mois : salaires, soldes (info), revenus, versements proposés.
- rendreOuverture(conteneur, {apres}) — formulaire d'ouverture du mois

## js/vues/recurrentes.js
Onglet Récurrentes et revue de début de mois par swipe.
- rendreRecurrentes(conteneur, {revue}) — liste ou revue par swipe

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
Onglet Budget : cartes, budgets par catégorie, par personne (salaire modifiable), graphiques SVG.
- rendreTableau(conteneur) — tableau de bord du mois affiché

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

## supabase/tests/rls_et_rpc.sql
Test SQL (begin … rollback) : RLS, RPC, mois sautés, contraintes.

## tests/calc.test.js
Tests `node:test` de `js/calc.js`.
