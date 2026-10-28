# CODEBASE_MAP — Budget familial

PWA statique (GitHub Pages) en modules ES natifs, données dans Supabase (projet `budget-familial`, eu-west-3).
Tests : `npm test` (logique pure) et `supabase/tests/rls_et_rpc.sql` (base, à lancer dans le SQL Editor).

## CLAUDE.md
Guide pour Claude Code : architecture, commandes, conventions.

## index.html
Coquille : bandeau `#mise-a-jour`, `#vue`, barre d'onglets `#onglets` (titre et entrée Rapports visibles sur ordinateur seulement), bouton `#btn-ajout-rapide`, conteneur `#feuilles`, bandeau `#hors-ligne`.

## style.css
Jetons « atelier d'ébéniste » (`:root` : lichen, noyer, chêne, mousse, miel, cèdre) et composants : cartes, jauges, listes, champs, boutons, onglets, feuille, swipe, graphiques, bandeaux.
Ordinateur (`min-width: 1024px`) : menu latéral, feuilles en fenêtres centrées, `.grille-ordinateur` (2 colonnes), Dépenses en tableau + panneau, rapports ; `@media print` pour le rapport.

## manifest.json
Métadonnées PWA « Budget familial » (couleurs lichen / noyer), icônes 192 et 512.

## icones/
Icônes de l'app (favicon, apple-touch-icon 180, 192, 512) : € chêne sur noyer veiné.

## package.json
Script `npm test` uniquement (aucune dépendance).

## .github/workflows/pages.yml
Publication GitHub Pages à chaque push sur main : tests, copie du site, version = commit dans `js/version.js` et `version.json` (avec la liste des fichiers).

## js/version.js
Version qui tourne (`__VERSION__` en local, numéro de commit une fois publiée).

## js/mise-a-jour.js
Bandeau « Nouvelle version disponible » : re-télécharge chaque fichier puis recharge ; signale si l'ancien code tourne encore.
- etatMiseAJour(locale, enLigne, tentative) — à jour / disponible / en attente
- initMiseAJour(bandeau) — vérifie au démarrage, au retour, toutes les 5 min

## js/config.js
URL et clé publique (anon) du projet Supabase.

## js/calc.js
Fonctions pures de calcul, sans DOM ni réseau.
- parseMontant(saisie, {negatif}) — lit un montant au clavier français
- formatEUR(n, {signe, entier}) — formate en euros fr-FR
- de(prenom) — « de Dylan » / « d'Amel »
- cleMois(date) — clé 'YYYY-MM' en heure locale
- moisActif(disponibles, date) / peutOuvrirEnAvance(date) — mois en cours : le suivant s'il a été ouvert en avance (possible dès le 20)
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
- evolutionCategories(moisDonnees, categories) — dépenses par catégorie et mois, hausses
- entreesSorties(donneesMois) — entrées et sorties réelles du mois
- epargneParMois(versements, objectifs, cles) — versé et prévu au départ
- progressionObjectif(objectif, versements, cles, moisCourant) — versé et % par mois, baisses
- raisonsBaisse(courant, precedent, categories, membres) — 3 écarts défavorables en clair
- projectionObjectif(objectif, versements, moisCourant) — rythme des 3 derniers mois, atteinte

## js/rapport.js
Rapport d'une période, pur (testé) : assemble les chiffres de calc.js pour l'onglet Rapports et les exports.
- construireRapport({debut, fin, parMois, reference, …}) — évolution, épargne, blocs par objectif
- texteProjection(objectif, projection) — phrases de la projection
- rapportEnMarkdown(rapport, {genereLe}) — export lisible, à coller dans une IA
- rapportEnJson(rapport, {genereLe}) — export brut, montants en euros
- libellePeriode / libelleCourt / formatPct / statutObjectif — libellés partagés

## js/db.js
Client Supabase et toutes les requêtes ; lève des erreurs en français.
- session() / surAuth(cb) — session courante, écoute de l'auth
- connecter / inscrire / deconnecter — email et mot de passe
- demanderReinitialisation(email) / changerMotDePasse(mdp) — mot de passe oublié
- chargerFoyer() — foyer, membres et membre courant
- creerFoyer(prenom) / rejoindreFoyer(code, prenom) — RPC foyer
- chargerMois(foyerId, cle) — mois, revenus, récurrentes, budgets, dépenses, versements
- chargerPlage(foyerId, debut, fin) — mois ouverts d'une période (+ référence), paginé
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
- modifierProfil(membreId, {prenom, salaire_defaut, paie_mois_precedent}) — profil du membre
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
- surTempsReel(fn) — prévenu à chaque événement Realtime

## js/ui.js
Helpers DOM (jamais d'innerHTML pour des données utilisateur).
- el(tag, attrs, ...enfants) — crée un élément
- estOrdinateur() / surChangementOrdinateur(cb) — seuil 1024 px, hors impression
- ajouter(parent, enfants) — ajoute en aplatissant, ignore null
- ouvrirFeuille(contenu, {titre}) — feuille du bas, fenêtre sur ordinateur
- telecharger(nom, contenu, type) — télécharge un fichier généré
- toast(message, {type}) — message temporaire
- versSaisie(n) — nombre au format de saisie
- champMontant(options) — champ montant validé en direct
- choixOuiNon({etiquette, valeur, oui, non, surChange}) — segment oui / non sans défaut
- caseACocher({etiquette, detail, valeur, surChange}) — case pleine largeur

## js/app.js
Démarrage et routage : connexion → foyer → ouverture du mois → onglets ; redémarre si le mois a changé.
`body[data-onglet]` = onglet actif ; sous 1024 px, Rapports bascule sur Budget ; le focus survit aux re-rendus.
- afficherOnglet(nom, options) — affiche un onglet
- seDeconnecter() — déconnexion avec message d'erreur
- ouvrirMoisSuivant() — ouverture en avance du mois suivant (paye reçue avant le 1er)

## js/vues/connexion.js
Connexion / inscription, création ou adhésion au foyer.
- rendreConnexion(conteneur, {apres}) — formulaire compatible trousseau iCloud, mot de passe oublié
- rendreNouveauMotDePasse(conteneur, {apres}) — retour du lien de réinitialisation
- rendreChoixFoyer(conteneur, {apres}) — créer ou rejoindre un foyer
- copier(texte) — copie dans le presse-papiers

## js/vues/ouverture.js
Ouverture du mois : sa part (salaire, solde), celle de l'autre en option, revenus déjà reçus, versements (puis revue des charges).
- rendreOuverture(conteneur, {apres, annuler}) — formulaire d'ouverture du mois

## js/vues/recurrentes.js
Onglet Récurrentes : charges communes / perso, variables à confirmer ; revue par swipe (montant modifiable, déjà prélevée).
- rendreRecurrentes(conteneur, {revue}) — liste groupée ou revue par swipe
- ouvrirConfirmation(ligne) — saisir le montant d'une charge variable

## js/vues/depenses.js
Onglet Dépenses, historique mensuel, formulaire de dépense partagé ; sur ordinateur, tableau + panneau de saisie et budgets.
- formulaireDepense({depense, onValider, prefixe}) — saisie / modification d'une dépense
- selecteurMois() — navigation ‹ mois › entre mois ouverts
- rendreDepenses(conteneur) — journal par date ou catégorie (tableau sur ordinateur)
- categorieDe(id) / aujourdhui() — utilitaires partagés

## js/vues/ajout-rapide.js
Bouton « + » flottant.
- initAjoutRapide(bouton) — ouvre la feuille de saisie rapide

## js/vues/tableau.js
Onglet Budget : disponible et reste libre, bilan des mois passés, budgets, par personne, graphiques SVG.
Exporte `COULEURS` et `GRIS_AUTRES` (couleurs des graphiques, réutilisées par les rapports).
- rendreTableau(conteneur) — tableau de bord du mois affiché
- bandeaux() / confirmerSalaire(membre, mm) — part à remplir, charge à confirmer, salaire reçu ?, ouvrir le mois suivant en avance
- editerMembre(membre, mm) — salaire, solde daté, déjà dans le solde
- bilan() — bilan d'un mois passé (remplace la prévision)

## js/vues/part-membre.js
Part d'un membre pour un mois (salaire déjà sur le compte ?, montant, solde), partagée ouverture / Budget.
- formulairePart({membre, cle, valeurs, premiereFois}) — questions, préremplissage si payé fin M-1
- de(prenom) — réexporté depuis calc.js

## js/vues/reglages.js
Feuilles ouvertes depuis l'onglet Budget.
- ouvrirRevenus() — autres revenus du mois
- ouvrirCategories() — créer, renommer, désactiver
- ouvrirProfil() — prénom, salaire habituel, salaire payé fin du mois d'avant

## js/vues/objectifs.js
Onglet Objectifs : suivi, versements / retraits, archives.
- rendreObjectifs(conteneur) — liste, création, détail
- estArchive(objectif) — archivé, atteint ou échu

## js/vues/rapports.js
Onglet Rapports (ordinateur seulement) : période, évolution des dépenses, épargne versée, un bloc par objectif, impression,
export (copie Markdown pour une IA, fichiers .md et .json).
- rendreRapports(conteneur) — rapport de la période choisie
- quitterRapports() — coupe chargement et temps réel

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

## supabase/migrations/008_paie_mois_precedent.sql
`membres.paie_mois_precedent` : salaire du mois M versé fin M-1 (réponse d'ouverture préremplie).

## supabase/tests/rls_et_rpc.sql
Test SQL (begin … rollback) : RLS, RPC, mois sautés, contraintes.

## tests/calc.test.js
Tests `node:test` de `js/calc.js`.

## tests/rapport.test.js
Tests de `js/rapport.js` (assemblage, Markdown, JSON).

## tests/mise-a-jour.test.js
Tests de `etatMiseAJour`.
