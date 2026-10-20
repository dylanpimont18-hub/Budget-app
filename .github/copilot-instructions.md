---
name: "Budget App workspace instructions"
description: "Guidance for editing the family budget PWA (static ES modules + Supabase)."
applyTo: "**/*"
---

## Project Purpose
Family budget PWA shared by a couple in real time. Static front end served by GitHub Pages, data in Supabase
(Auth email/password, Postgres with row-level security per household, Realtime). UI and messages are in French.

- `index.html`: page shell (view container, bottom tab bar, quick-add button, sheet container).
- `style.css`: terracotta design tokens (`:root`) and components, mobile first (375 px).
- `js/`: native ES modules, no bundler. See `CODEBASE_MAP.md` for the role of each file and function.
  - `js/calc.js`: pure calculations (amounts, months, budget summary, goals). No DOM, no network.
  - `js/db.js`: the only place that talks to Supabase.
  - `js/etat.js`: app state store, reload and Realtime.
  - `js/vues/*.js`: one module per screen/tab.
- `supabase/migrations/`: schema, RLS and RPC (applied with the Supabase MCP `apply_migration`).
- `supabase/tests/rls_et_rpc.sql`: SQL test run in a `begin … rollback` block.
- There is no `script.js` any more.

## How to Work
- Keep the app static: no build step, no npm dependencies. `package.json` only holds the test script.
- `supabase-js` is loaded from jsDelivr with a pinned version.
- Only the public (anon) Supabase key may appear in the code; never a service key.
- Insert user data with `textContent` (the `el()` helper), never `innerHTML`.
- Amounts are parsed with `parseMontant` (French keyboard: `12,50`) and displayed with `formatEUR`.
- Keep touch targets ≥ 44 px and no horizontal scroll at 375 px.

## Testing & Preview
```bash
npm test                     # node --test on tests/*.test.js
python -m http.server 8000   # then open http://localhost:8000
```
Run `supabase/tests/rls_et_rpc.sql` in the Supabase SQL Editor after any database change.
