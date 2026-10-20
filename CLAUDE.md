# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Budget familial** is a French-language PWA for a couple's monthly budget, shared in real time. Static front end
(native ES modules, no build, no npm dependencies) served by GitHub Pages; data in Supabase (Auth email/password,
Postgres with row-level security per household, Realtime). `supabase-js` is loaded from jsDelivr at a pinned version.

Start with `CODEBASE_MAP.md`: it lists every file and its main functions. Spec and plan live in `docs/superpowers/`.

## Commands

```bash
npm test                     # node --test on tests/*.test.js (pure logic in js/calc.js)
python -m http.server 8000   # local preview at http://localhost:8000
```

Database changes: add a numbered file in `supabase/migrations/`, apply it with the Supabase MCP `apply_migration`
(project `budget-familial`, eu-west-3), then run `supabase/tests/rls_et_rpc.sql` in the Supabase SQL Editor.

## Architecture

- `js/calc.js` — pure calculations (amounts, months, budget summary, goals). No DOM, no network. Tested.
- `js/db.js` — the only module that talks to Supabase; throws `Error`s with French messages.
- `js/etat.js` — store: `etat`, `abonner`/`notifier`, `recharger()` (ignores stale responses), Realtime with a 300 ms debounce.
- `js/app.js` — routing: login → household → month opening → tabs (Récurrentes, Dépenses, Budget, Objectifs).
- `js/vues/*.js` — one module per screen; each tab re-renders on every `notifier()`.
- Supabase: every table carries `foyer_id`; RLS through `est_membre(foyer_id)`; household creation/joining and month
  opening go through `security definer` RPCs (`creer_foyer`, `rejoindre_foyer`, `ouvrir_mois`, idempotent).
- Recurring charges and category budgets have a template (`recurrentes`, `categories.budget_defaut`) copied into each
  month when it is opened; edits update both the month and the template. Categories are deactivated, never deleted.

## Conventions

- UI language is **French**. Amounts are parsed with `parseMontant` (French keyboard, `12,50`) and displayed with `formatEUR`.
- Build DOM with `el()` / `ajouter()` from `js/ui.js`: user data goes through `textContent`, never `innerHTML`.
- Use the CSS tokens on `:root` in `style.css` (terracotta palette from the Excel); no hard-coded colours.
- Smartphone first: works at 375 px with no horizontal scroll, touch targets ≥ 44 px, respect `env(safe-area-inset-*)`.
- Only the public (anon) Supabase key may appear in code; never a service key.
- Nothing is counted twice (`syntheseMois` in `calc.js`): each member's balance (`solde`, dated `solde_le`) is the
  starting point; add only what is not in it yet (salary unless `salaire_dans_solde`, other income unless
  `revenus_mois.dans_solde`), subtract only what has not left yet (charges unless `recurrentes_mois.dans_solde`,
  max(budget, spent) minus the payer's expenses dated before `solde_le`, goal transfers). `salaire_recu` is display only.
- Recurring charges can be personal (`membre_id`, null = shared) and variable (`variable`: each new month copies the
  last amount with `a_confirmer = true` until it is entered).
- Each member fills in their own part of the month (`mois_membres.renseigne`); `ouvrir_mois` returns `{mois_id, cree}`
  and adds the caller's part if the month already exists.
- Address the user with « tu » everywhere in the UI.
