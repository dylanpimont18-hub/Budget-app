# Version ordinateur et rapports — Conception

Conçu le 2026-10-21 avec Dylan. Complète `2026-10-20-budget-familial-design.md`.

## 1. Intention

Le téléphone sert à saisir au quotidien ; il fonctionne bien et ne doit pas changer. L'ordinateur sert à **prendre du
recul** : lire des rapports détaillés à l'écran, les imprimer, suivre l'évolution d'un mois à l'autre et projeter
l'avancement des objectifs d'épargne. La question type à laquelle l'app doit répondre :

> « Le mois dernier on a rempli 7 % de l'objectif Vacances, ce mois-ci 5 % — parce que les courses ont coûté 120 € de
> plus et qu'il n'y a pas eu de prime. À ce rythme, on l'atteint en mars 2028 au lieu de décembre 2027. »

## 2. Objectifs, non-objectifs, anti-objectifs

**Objectifs**
- Une disposition ordinateur : menu latéral à gauche, contenu qui profite de la largeur (choix « A » puis « B » des maquettes).
- Un nouvel onglet **Rapports**, lisible à l'écran et imprimable proprement.
- Rapports : évolution des dépenses par catégorie (les courses en premier lieu), épargne réellement versée, un bloc
  par objectif (progression mensuelle, entrées / sorties, « pourquoi », projection).

**Non-objectifs**
- Pas d'import de l'historique Excel (décision de Dylan) : les rapports commencent au premier mois ouvert dans l'app.
- Pas de rapports sur téléphone pour le moment.
- Pas d'export PDF / CSV dédié : l'impression du navigateur suffit (« Enregistrer en PDF » au besoin).
- Pas de changement de schéma Supabase prévu : tout se calcule à partir des tables existantes.

**Anti-objectifs (échec même si « ça marche »)**
- La version téléphone change ou se dégrade (375 px, cibles 44 px, barre du bas, bouton « + »).
- Les chiffres des rapports contredisent ceux de l'onglet Budget ou Objectifs pour un même mois.
- Une impression qui sort le menu, les boutons ou des cartes coupées en deux entre deux pages.

## 3. Contraintes

Celles de `CLAUDE.md` : modules ES natifs sans build ni dépendance npm, français et tutoiement, `el()`/`ajouter()`
(jamais `innerHTML` pour des données), jetons CSS de `:root` (graphiques exceptés), calculs purs dans `js/calc.js`
testés avec `node --test`, accès réseau uniquement via `js/db.js`.

## 4. Disposition ordinateur (décidé)

- **Seuil** : à partir de 1024 px de large *(mon choix ; entre 600 et 1023 px la version actuelle reste en place)*.
- **Menu latéral** à gauche, fond noyer, titre « Budget familial » en Fraunces, entrées : Récurrentes, Dépenses,
  Budget, Objectifs, **Rapports**. C'est la même `nav#onglets` restylée par media query, pas un second menu.
- L'onglet **Rapports** n'existe **que sur ordinateur** (décision de Dylan) : son entrée est masquée sous 1024 px, la
  barre du bas du téléphone reste à 4 onglets. Si la fenêtre passe sous 1024 px alors que Rapports est affiché, l'app
  bascule sur l'onglet Budget *(mon choix)*.

### 4.1 Onglets existants adaptés à la largeur (décidé : option B)
- **Dépenses** : tableau à gauche (date, libellé, catégorie, qui, montant ; clic sur une ligne = modifier comme
  aujourd'hui), à droite un panneau fixe avec le formulaire « Nouvelle dépense » toujours ouvert (réutilise
  `formulaireDepense`) et, en dessous, l'état des budgets par catégorie. Le bouton flottant « + » est masqué sur cet
  onglet en mode ordinateur.
- **Budget** : les cartes existantes se répartissent sur 2 colonnes.
- **Récurrentes, Objectifs** : même principe, grille de cartes sur 2 colonnes *(mon choix)*. La revue par swipe reste
  utilisable à la souris (glisser) et garde ses boutons.
- Les feuilles modales du bas deviennent des fenêtres centrées (largeur max ~520 px) *(mon choix)*.

## 5. Onglet Rapports (décidé : lecture « document », de haut en bas)

En-tête : titre « Rapport · avril → octobre 2026 », sélecteur de période (**6 derniers mois** par défaut,
**l'année en cours**, **de … à …** parmi les mois ouverts), bouton **Imprimer** (`window.print()`).
Seuls les mois ouverts dans la période sont pris en compte ; un mois sauté apparaît comme « non ouvert ».

### 5.1 Évolution des dépenses
- Tableau : catégories en lignes (actives, plus les inactives ayant des dépenses dans la période), mois en colonnes,
  dernière colonne = moyenne. Montant par cellule = dépenses ponctuelles du mois dans la catégorie.
- Mise en évidence d'une hausse : cellule en `--orange-*` si > moyenne de la période de plus de 15 % et de plus de 20 € *(seuils : mon choix)*.
- Graphique en barres (SVG, comme `tableau.js`) de la catégorie sélectionnée ; **Courses** sélectionnée par défaut
  si elle existe, sinon la plus grosse. Clic sur une ligne du tableau = change le graphique.
- Ligne supplémentaire « Charges fixes » (somme des `recurrentes_mois` du mois) pour voir aussi leur évolution.

### 5.2 Épargne réellement versée
- Par mois : total des `versements` (`mois_cle` du mois, retraits négatifs inclus), et la décomposition par objectif.
- Comparé au **prévu au départ** du mois = somme des `effortMensuel` (cible / nombre de mois) des objectifs non
  archivés actifs ce mois-là (debut ≤ mois ≤ fin), y compris ceux atteints depuis. Libellé « prévu au départ » pour
  ne pas le confondre avec l'effort recalculé de l'onglet Objectifs *(mon choix)*.
- Graphique en barres versé / prévu par mois, et un total cumulé sur la période.

### 5.3 Un bloc par objectif
Pour chaque objectif non archivé dont la période recoupe la période du rapport (les archivés : repliés en bas) :
- En-tête : nom, icône, cible, échéance, jauge du total versé (mêmes chiffres que `suiviObjectif`).
- Tableau mois par mois : **Versé**, **% de l'objectif** (= versé du mois / cible), **Entrées**, **Sorties**,
  **Pourquoi**.
  - *Entrées* = salaires de `mois_membres` + `revenus_mois` du mois.
  - *Sorties* = `recurrentes_mois` + dépenses ponctuelles du mois (réelles, pas les budgets). Une charge variable
    encore `a_confirmer` compte pour son montant recopié, comme dans l'onglet Budget, marquée « estimé » *(mon choix)*.
  - Entrées et sorties sont celles du foyer (identiques d'un objectif à l'autre) : c'est le contexte qui explique l'effort.
- **Pourquoi** : rempli seulement quand le % baisse par rapport au mois précédent ouvert. Comparaison automatique avec
  ce mois-là, on cite les 2 à 3 plus gros écarts défavorables (≥ 20 € *(mon choix)*), formulés en clair :
  - catégorie de dépense en hausse : « Courses +120 € » ;
  - charge fixe nouvelle ou en hausse : « Nourrice +80 € » ;
  - revenu disparu ou en baisse : « pas de Primes », « salaire d'Amel −150 € ».
  Si rien ne dépasse le seuil : « — ». Le premier mois de la période se compare au mois ouvert qui le précède
  (chargé en plus, hors affichage) *(mon choix)*. Une charge variable encore `a_confirmer` n'est jamais citée.
- **Projection** sous le tableau :
  - rythme = moyenne des versements des 3 derniers mois **terminés** (avant le mois calendaire courant), comptés
    depuis aujourd'hui et non depuis la fin de la période choisie, en ignorant les mois avant le `debut` de
    l'objectif ; un mois terminé sans versement compte pour 0 € ; moins de 3 mois disponibles → moyenne de ceux qui
    existent, aucun → pas de projection *(décidé en principe ; règles : mon choix)* ;
  - « À ce rythme : atteint en mars 2028 (prévu : décembre 2027) » ; « en avance » si avant l'échéance ;
  - « Il faudrait X €/mois pour tenir décembre 2027 » (= `effortRecalcule` de `suiviObjectif`) ;
  - rythme ≤ 0 : « À ce rythme, l'objectif n'est pas atteint » ; objectif atteint : « Atteint ✓ ».

### 5.4 Impression
`@media print` : menu, bouton « + », bandeaux, sélecteurs et boutons masqués ; fond blanc ; cartes et lignes de
tableau en `break-inside: avoid` ; graphiques conservés ; en-tête du rapport avec la période et la date d'impression.

## 6. Données et calculs

- Nouvelle fonction `db.js` qui charge en une fois les données d'une plage de mois (mois, `mois_membres`,
  `revenus_mois`, `recurrentes_mois`, dépenses par plage de dates, versements par plage de `mois_cle`). Les
  objectifs et catégories sont déjà dans `etat.donnees`.
- Chargée à l'ouverture de l'onglet Rapports et au changement de période, sans toucher au `recharger()` du mois
  affiché. Rechargée sur événement temps réel tant que l'onglet est affiché.
- Nouvelles fonctions pures dans `calc.js`, testées : évolution par catégorie, épargne versée / prévue par mois,
  entrées / sorties d'un mois, écarts expliquant une baisse, projection d'un objectif.

## 7. Laissé au constructeur

Découpage des modules (une vue `js/vues/rapports.js` est attendue), noms des fonctions, détails visuels dans la
palette existante, couleurs des graphiques, gestion du chargement et des erreurs (toast comme ailleurs).
