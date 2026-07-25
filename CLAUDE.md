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

The app targets **smartphone use only** (touch gestures, bottom tab bar, safe-area insets) — do not add desktop-only interactions (hover states, keyboard shortcuts, mouse-drag) without discussing it first.

### Four-View SPA + persistent bottom nav

The app uses a single-page layout with four `<section class="view">` elements that are shown/hidden via the `.active` CSS class. Navigation is handled by `showView(viewName)` in `script.js`, which also syncs the `.active` state of `#bottom-nav .nav-btn` buttons and hides the nav bar (`.bottom-nav.hidden`) while in `view-swipe`.

| View ID         | Purpose                                         | Reachable via |
|-----------------|--------------------------------------------------|---------------|
| `view-home`     | Landing screen: total, delta vs last save, sparkline trend, top-3 expenses | `#bottom-nav` tab |
| `view-swipe`    | Card-by-card swipe review of each expense, with a stacked-cards preview and progress bar | `#btn-start` on home (full-screen flow, nav hidden) |
| `view-recap`    | Summary list — tap a row to edit, swipe a row left to delete (with undo toast) | `#bottom-nav` tab |
| `view-compare`  | Scenario simulator: compare current vs modified amounts, supports multiple named saved scenarios | `#bottom-nav` tab |

`view-swipe` is a modal-like flow (started from the home button, exited via `✕ Annuler` or by finishing the deck), not a nav tab.

### State Model

All state lives in in-memory variables and `localStorage`:

- **`expenses`** — the persisted master list, loaded from `localStorage` key `'comptesCommuns'` on startup; falls back to `defaultExpenses` if absent.
- **`reviewSession`** — a sorted copy of `expenses` (see `applySwipeSort`) built at swipe-session start; holds provisional `status` changes until `saveData()` is called.
- **`currentIndex`** — pointer into `reviewSession` during the swipe view.
- **`editExpenseId`** — tracks which expense the modal form is editing (`null` = new expense).
- **`selectedIcon`** — the emoji currently picked in the expense form's emoji picker; written to the expense's `icon` field on save.
- **`scenarioOverrides`** — object `{ [id]: amount }` persisted to `localStorage` key `'comptesCommuns_scenario'`; the "current" (unsaved) scenario draft shown in `view-compare`. Cleared automatically when an expense is deleted or data is reset.
- **`scenarios`** — object `{ [name]: overridesObject }` persisted to `localStorage` key `'comptesCommuns_scenarios'`; named scenarios a user can save/reload/delete via the select at the top of `view-compare`.
- **`swipeSortMode`** / **`recapSortMode`** — persisted to `localStorage` (`'comptesCommuns_sortMode'`, `'comptesCommuns_recapSort'`); control card order in swipe and row order in the recap list.
- **`recapSearchTerm`** — in-memory only, filters the recap list by name as the user types.

Each expense object shape: `{ id: number, name: string, amount: number, icon: string, status: 'active' | 'deleted' }`. Additional `localStorage` keys: `'comptesCommuns_history'` (array of `{ total, date }` snapshots, capped at 30, used for the home delta text and sparkline — appended by `pushHistorySnapshot()` inside `saveData()`) and `'comptesCommuns_onboarded'` (flag set after the first-launch onboarding overlay is dismissed).

### Persistence via `saveData()`

`saveData()` **permanently removes** deleted expenses — it filters out `status === 'deleted'` entries before writing to `localStorage`, then pushes a history snapshot and re-renders the home totals. Undo works two ways: within the current swipe session (before `saveData()` is called) by decrementing `currentIndex` and resetting status to `'active'`; and after a recap deletion, via the `showToast()` undo action, which re-inserts the removed expense and calls `saveData()` again.

### Swipe Interaction

Touch events (`touchstart`, `touchmove`, `touchend`) are attached directly to `#card-container`. A drag of >100px right calls `handleAction('active')`; left calls `handleAction('deleted')`, and `navigator.vibrate()` fires on each decision. After a 300 ms CSS animation delay, `currentIndex` increments and the next card renders. `#card-back-1`/`#card-back-2` render a faint stacked preview of the next two cards; `#progress-bar-fill` tracks completion. When `currentIndex >= reviewSession.length`, `saveData()` is called automatically and the app transitions to `view-recap`. `#btn-sort-swipe` cycles `swipeSortMode` (default / amount desc / alphabetical) and re-sorts `reviewSession`.

### Recap List Interaction

Each `<li>` in `#summary-list` contains a `.swipe-delete-bg` (revealed red background) behind a `.swipe-content` wrapper. Dragging `.swipe-content` left past 80px deletes the expense (soft-delete + undo toast, no confirmation dialog); tapping it (when the drag distance was below the suppress-click threshold) opens the edit modal via `openExpenseForm()`. `#recap-search` and `#recap-sort` filter/sort the rendered list; a thin `.expense-bar-fill` under each row shows the expense's proportion relative to the largest active expense.

### Scenario / Compare View

`view-compare` lets the user model a modified budget without affecting the real data. Each expense row has an editable input pre-filled with its current (scenario) amount; changing a value writes to `scenarioOverrides` and persists to `localStorage`, and the badge shows both the € and % delta (`fmtDiff`). The summary card and the two `.bar-fill` comparison bars update in real time. `#scenario-select` switches between `scenarios` (named, saved via `#btn-save-scenario`, deletable via `#btn-delete-scenario`) and the current unsaved draft (`__current`).

## Conventions

- **CSS design tokens** are defined as custom properties on `:root` in `style.css` (`--primary`, `--danger`, `--success`, `--surface-color`, `--swipe-accept-bg`, `--swipe-reject-bg`, etc.), with a dark-mode override block under `@media (prefers-color-scheme: dark)`. Use the tokens rather than hard-coded colours (including in inline JS style assignments — `element.style.backgroundColor = 'var(--token)'` works and stays theme-aware).
- **IDs in HTML** are the contract between `index.html` and `script.js`. Renaming an ID requires updating both files.
- The UI language is **French**. All user-visible strings should remain in French.
- Monetary values are formatted with `fmtMoney()` (`Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })`), not manual string concatenation.
- User-supplied text (expense names, scenario names) is injected into `innerHTML` through `escapeHtml()` — never interpolate raw user input into a template string bound for `innerHTML`.
- New expenses receive whatever emoji is selected in the expense form's `#emoji-picker` (`selectedIcon`, from the `EMOJI_CHOICES` list), defaulting to `📝` for a brand-new expense.
- Destructive actions use a non-blocking undo toast (`showToast()`) rather than `window.confirm()`, except `restoreDefaultData()` (full data reset), which is rare/high-impact enough to keep a native `confirm()`.
- The app is **smartphone-only**: no hover-dependent UI, no keyboard-only affordances beyond the existing `Escape`-to-close-modal handler. Respect `env(safe-area-inset-*)` on fixed-position elements (`#bottom-nav`, `.fab`, `#toast`).
- The PWA manifest and Apple meta tags target standalone mobile display — keep `index.html` free of desktop-only assumptions.
