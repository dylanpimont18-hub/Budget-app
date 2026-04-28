# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Comptes Communs** is a French-language static PWA budget tracker. There are no build tools, no Node.js packages, and no frameworks — the entire app is four files: `index.html`, `style.css`, `script.js`, and `manifest.json`.

## Local Preview

```bash
python -m http.server 8000
# then open http://localhost:8000
```

There is no test suite, linter, or build step.

## Architecture

### Three-View SPA

The app uses a single-page layout with three `<section class="view">` elements that are shown/hidden via the `.active` CSS class. Navigation is handled entirely by `showView(viewName)` in `script.js`.

| View ID         | Purpose                                         |
|-----------------|-------------------------------------------------|
| `view-home`     | Landing screen, shows total estimated budget    |
| `view-swipe`    | Card-by-card swipe review of each expense       |
| `view-recap`    | Summary list with edit/delete actions           |
| `view-compare`  | Scenario simulator: compare current vs modified amounts |

### State Model

All state lives in in-memory variables and `localStorage`:

- **`expenses`** — the persisted master list, loaded from `localStorage` key `'comptesCommuns'` on startup; falls back to `defaultExpenses` if absent.
- **`reviewSession`** — a shallow copy of `expenses` built at swipe-session start; holds provisional `status` changes until `saveData()` is called.
- **`currentIndex`** — pointer into `reviewSession` during the swipe view.
- **`editExpenseId`** — tracks which expense the modal form is editing (`null` = new expense).
- **`scenarioOverrides`** — object `{ [id]: amount }` persisted to `localStorage` key `'comptesCommuns_scenario'`; stores per-expense amount overrides for the compare view. Cleared automatically when an expense is deleted or data is reset.
- **`previousView`** — tracks which view (`'home'` or `'recap'`) navigated to the compare view, so the back button returns there.

Each expense object shape: `{ id: number, name: string, amount: number, icon: string, status: 'active' | 'deleted' }`.

### Persistence via `saveData()`

`saveData()` **permanently removes** deleted expenses — it filters out `status === 'deleted'` entries before writing to `localStorage`. Undo only works within the current swipe session (before `saveData()` is called), by decrementing `currentIndex` and resetting status to `'active'`.

### Swipe Interaction

Touch events (`touchstart`, `touchmove`, `touchend`) are attached directly to `#card-container`. A drag of >100px right calls `handleAction('active')`; left calls `handleAction('deleted')`. After a 300 ms CSS animation delay, `currentIndex` increments and the next card renders. When `currentIndex >= reviewSession.length`, `saveData()` is called automatically and the app transitions to `view-recap`.

### Scenario / Compare View

`view-compare` lets the user model a modified budget without affecting the real data. Each expense row has an editable input pre-filled with its current amount; changing a value writes to `scenarioOverrides` and persists to localStorage. The summary card at the top updates in real time showing current total → scenario total and the monthly delta. The back button returns to whichever view (`home` or `recap`) opened the compare screen, tracked via `previousView`.

## Conventions

- **CSS design tokens** are defined as custom properties on `:root` in `style.css` (`--primary`, `--danger`, `--success`, `--surface-color`, etc.). Use them rather than hard-coded colours.
- **IDs in HTML** are the contract between `index.html` and `script.js`. Renaming an ID requires updating both files.
- The UI language is **French**. All user-visible strings should remain in French.
- New expenses added at runtime always receive `icon: '📝'`; icons are only set explicitly in `defaultExpenses`.
- The PWA manifest and Apple meta tags target standalone mobile display — keep `index.html` free of desktop-only assumptions.
