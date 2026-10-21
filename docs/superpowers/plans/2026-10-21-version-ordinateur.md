# Version ordinateur et rapports — Plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** une disposition ordinateur (≥ 1024 px, menu latéral, onglets en largeur) et un onglet Rapports imprimable,
sans rien changer à la version téléphone.

**Architecture:** une seule media query `@media (min-width: 1024px)` restyle la coquille existante ; `estOrdinateur()`
(`ui.js`) choisit le rendu JS de Dépenses ; `app.js` re-rend l'onglet actif au passage du seuil. Les rapports
chargent leur propre plage de mois (`db.chargerPlage`), indépendante de `recharger()`, et tous leurs chiffres
viennent de fonctions pures de `calc.js` (qui réutilisent `syntheseMois` et `suiviObjectif` pour ne jamais
contredire les onglets Budget et Objectifs).

**Tech Stack:** modules ES natifs, aucune dépendance npm, supabase-js 2.45.4 (jsDelivr), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-21-version-ordinateur-design.md`

## Global Constraints

- Interface en français, tutoiement ; montants saisis avec `parseMontant`, affichés avec `formatEUR`.
- DOM via `el()` / `ajouter()` ; données utilisateur en `textContent`, jamais `innerHTML`.
- Couleurs : jetons de `:root` uniquement (graphiques SVG exceptés : `COULEURS` de `tableau.js`).
- `calc.js` pur et testé ; seul `db.js` parle à Supabase (erreurs en français).
- Aucun changement de schéma Supabase.
- Seuil ordinateur : `min-width: 1024px`. Sous ce seuil, rendu identique à aujourd'hui (375 px sans défilement
  horizontal, cibles ≥ 44 px, barre du bas à 4 onglets, bouton « + », `env(safe-area-inset-*)`).
- Seuils : hausse = cellule > moyenne × 1,15 **et** > moyenne + 20 € ; « pourquoi » = écarts défavorables ≥ 20 €,
  3 au plus.

## Review Focus

1. Saisie en cours dans le panneau Dépenses pendant qu'un événement temps réel re-rend l'onglet : la saisie ne doit
   pas être perdue (le formulaire est conservé entre deux rendus, focus restauré).
2. Plus de 1000 dépenses sur une période (année) : PostgREST tronque à 1000 lignes ; `chargerPlage` pagine.
3. Réponse de `chargerPlage` arrivée après un changement de période : ignorée (numéro de génération).
4. Objectif terminé avant la fin de la période : pas de « pourquoi » après sa fin (`baisse` limitée à
   `debut ≤ mois ≤ fin`) — testé dans la tâche 2.
5. Deux formulaires de dépense dans le DOM (panneau + feuille de modification) : identifiants distincts
   (`prefixe`) pour que les `<label for>` restent justes.

---

## Forme des données d'un mois (partagée par les tâches 2 à 4)

`DonneesMois = {cle, mois: {id, cle}, membresMois: [{membre_id, salaire, …}], revenus: [{libelle, montant, …}],
recurrentes: [{recurrente_id, libelle, montant, a_confirmer, variable, membre_id, …}],
depenses: [{date, montant, categorie_id, membre_id, libelle}], versements: [{objectif_id, mois_cle, montant}]}`

### Task 1: Disposition ordinateur (coquille)

**Files:** Modify `index.html`, `style.css`, `js/ui.js`, `js/app.js`

**Interfaces:**
- Produces: `estOrdinateur(): boolean`, `surChangementOrdinateur(cb: (ordi: boolean) => void)` dans `ui.js`
  (garde `globalThis.matchMedia` absent) ; `document.body.dataset.onglet` = onglet actif ;
  `rendus.rapports` (vue de la tâche 4, provisoirement un titre).

- [ ] Ajouter dans `nav#onglets` un titre `<p class="onglets-titre">Budget familial</p>` et
  `<button data-onglet="rapports"><span aria-hidden="true">📑</span>Rapports</button>` ; les deux en
  `display: none` hors media query (la grille à 4 colonnes reste intacte).
- [ ] `@media (min-width: 1024px)` : menu fixe à gauche (`--largeur-menu: 232px`, fond `--noyer`, titre Fraunces,
  entrées en ligne ≥ 44 px, active sur `--noyer-clair` avec filet miel à gauche) ; `body` : `padding-left` = menu,
  `padding-bottom: 32px` ; `.vue` max 1200 px ; bouton « + » et toast replacés en bas sans barre ; feuilles en
  fenêtre centrée (max 520 px, rayon 22 px partout, entrée en fondu) ; « + » masqué si `body[data-onglet="depenses"]`.
- [ ] `app.js` : `body.dataset.onglet` mis à jour ; `surChangementOrdinateur` → si `!ordi` et onglet `rapports`,
  `afficherOnglet('tableau')`, sinon re-rendre l'onglet actif.
- [ ] Vérifier à 375 px (capture identique à `main`) et 1280 px ; commit `style: disposition ordinateur, menu latéral`.

### Task 2: Calculs des rapports (TDD)

**Files:** Modify `js/calc.js`, `tests/calc.test.js`, `js/vues/part-membre.js` (`de` déplacé dans `calc.js`, réexporté)

**Interfaces (Produces):**
- `formatEUR(n, {signe, entier})` — `entier: true` arrondit à l'euro : `formatEUR(120, {entier: true}) === '120 €'`.
- `de(prenom)` — inchangé, déplacé.
- `evolutionCategories(moisDonnees, categories)` ; `moisDonnees = [{cle, ouvert, depenses, recurrentes}]` →
  `{lignes: [{categorie, valeurs: (number|null)[], moyenne, hausses: boolean[]}], chargesFixes: {valeurs, moyenne, hausses}}`.
  Mois non ouvert → `null`, exclu de la moyenne. Catégories actives + inactives avec dépenses, triées par `ordre`.
- `entreesSorties(d: DonneesMois)` → `{entrees, sorties, salaires, revenus, charges, depenses, estime}` ; calculé via
  `syntheseMois` (`salaires + autresRevenus`, `chargesFixes + Σ dépenses`) ; `estime` = une charge `a_confirmer`.
- `epargneParMois(versements, objectifs, cles)` → `{mois: [{cle, verse, parObjectif: {[id]: n}, prevu}], totalVerse, totalPrevu}` ;
  `prevu` = Σ `effortMensuel` des objectifs `!archive` avec `debut ≤ cle ≤ fin`.
- `progressionObjectif(objectif, versements, cles)` → `[{cle, verse, pct, baisse}]` ; `cles` = mois ouverts croissants
  (référence incluse) ; `baisse` = `pct` < celui de l'entrée précédente, les deux dans `[debut, fin]`.
- `raisonsBaisse(courant, precedent, categories, membres)` → `string[]` (≤ 3, triés par écart décroissant, seuil 20 €) :
  `'Courses +120 €'`, `'Nourrice +80 €'` (charge appariée par `recurrente_id`, sinon libellé ; jamais `a_confirmer`),
  `'pas de Primes'`, `'Primes −30 €'`, `'salaire d'Amel −150 €'`.
- `projectionObjectif(objectif, versements, moisCourant)` → `{statut: 'atteint'|'projete'|'non_atteint'|'sans', rythme,
  moisAtteinte, enAvance, effortNecessaire, echu}` ; rythme sur les 3 mois avant `moisCourant` (≥ `debut`, 0 si rien
  versé) ; départ = mois courant, ou le suivant si déjà versé ce mois-ci (comme `suiviObjectif`) ;
  `effortNecessaire = suiviObjectif(...).effortRecalcule`.

- [ ] Écrire les tests (cas : mois non ouvert, objectif commencé en cours de période, retrait négatif, catégorie
  désactivée, période d'un mois, aucun mois ouvert, seuil 15 %/20 €, `a_confirmer` jamais cité, élision, projection
  1/2/3 mois, rythme 0, atteint, objectif terminé avant la période) ; `npm test` échoue.
- [ ] Implémenter ; `npm test` passe ; commit `feat: calculs des rapports (évolution, épargne, pourquoi, projection)`.

### Task 3: Chargement d'une plage de mois

**Files:** Modify `js/db.js`, `js/etat.js`

**Interfaces (Produces):**
- `chargerPlage(foyerId, debut, fin)` → `{parMois: {[cle]: DonneesMois}, reference: cle|null}` : mois ouverts de
  `debut` à `fin` + le dernier ouvert avant `debut` ; une requête par table (`.in('mois_id', ids)`, dépenses par dates,
  versements par `mois_cle`), paginée par 1000.
- `surTempsReel(fn): () => void` dans `etat.js` : appelé à chaque événement Realtime (sans toucher `recharger`).

- [ ] Implémenter, vérifier dans l'aperçu (tâche 4) ; commit avec la tâche 4.

### Task 4: Vue Rapports

**Files:** Create `js/vues/rapports.js` ; Modify `js/app.js`, `js/vues/tableau.js` (exporter `COULEURS`, `GRIS_AUTRES`), `style.css`

**Interfaces (Produces):** `rendreRapports(conteneur)`, `quitterRapports()` (appelé par `app.js` en quittant l'onglet).

- [ ] État du module : période `{type: 'six'|'annee'|'plage', debut, fin}`, données, génération ; chargement à
  l'ouverture et au changement de période, réponses périmées ignorées, anti-rebond 300 ms sur `surTempsReel`.
- [ ] Sections : en-tête (titre, période, Imprimer, date d'impression visible à l'impression), évolution (tableau +
  barres, Courses par défaut sinon la plus grosse), épargne (barres versé / prévu, détail, total), un bloc par objectif
  `!archive` recoupant la période (archivés dans `<details>`), projection.
- [ ] `@media print` : menu, « + », bandeaux, sélecteurs, boutons masqués ; fond blanc ; `break-inside: avoid`.
- [ ] Commit `feat: onglet Rapports (évolution, épargne, objectifs, impression)`.

### Task 5: Onglets existants en largeur

**Files:** Modify `js/vues/depenses.js`, `js/vues/tableau.js`, `js/vues/recurrentes.js`, `js/vues/objectifs.js`, `style.css`

- [ ] `formulaireDepense({depense, onValider, prefixe = 'depense'})`.
- [ ] Dépenses ordinateur : tableau (date, libellé, catégorie, qui, montant ; ligne cliquable au clavier) +
  panneau collant (formulaire conservé entre rendus ; après ajout : nouveau formulaire, focus sur le montant) +
  état des budgets (jauges `niveauBudget`).
- [ ] Budget / Récurrentes / Objectifs : sections enveloppées dans `.grille-ordinateur` (bloc sur téléphone, 2
  colonnes ≥ 1024 px) ; revue des récurrentes dans `.colonne-etroite`.
- [ ] Vérifier 375 px inchangé ; commit `style: onglets en deux colonnes, dépenses en tableau sur ordinateur`.

### Task 6: Finitions et vérification

- [ ] `CODEBASE_MAP.md`, `CLAUDE.md` (seuil 1024 px, Rapports réservé à l'ordinateur) ; commit `docs: …`.
- [ ] `npm test` ; captures 375 / 1280 / bascule 1280→800 / aperçu d'impression ; contrôle croisé des totaux ;
  revue de code ; corrections.
