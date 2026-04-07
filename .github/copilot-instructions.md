---
name: "Budget App workspace instructions"
description: "Guidance for editing this static budget tracker web app with HTML/CSS/JS and PWA manifest."
applyTo: "**/*"
---

## Project Purpose
This repository is a simple static budget tracker web app. It uses:
- `index.html` for structure and page content
- `style.css` for styling and responsive layout
- `script.js` for budget logic, DOM interaction, and persistence
- `manifest.json` for Progressive Web App metadata

## How to Work
- Keep the app static: no build tools, no Node.js packages, and no framework dependencies.
- Prefer semantic HTML and accessible form controls.
- Keep styling responsive and mobile-friendly.
- Keep JavaScript modular and readable within `script.js`.
- Use browser preview or a lightweight local server for testing.

## Conventions
- `index.html` is the single page shell and should contain page structure and IDs/classes used by `script.js`.
- `style.css` should handle layout, spacing, colors, typography, and responsive breakpoints.
- `script.js` should handle adding/removing budget items, calculating totals, filtering data, and saving state.
- `manifest.json` should remain focused on PWA metadata; avoid moving app logic there.

## Testing & Preview
There is no dedicated build or test system. For local preview, use a browser or a simple HTTP server such as:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Helpful Prompts
- "Improve accessibility and keyboard navigation for the budget app."
- "Make this app fully responsive on mobile, tablet, and desktop."
- "Add support for categories and monthly totals in `script.js`."
- "Refactor the JavaScript so DOM updates and calculations are separated."
- "Suggest UI improvements for the budget tracker layout and color contrast."
