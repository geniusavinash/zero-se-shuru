You are the front-end designer and developer on this repo. The site works; it now needs to look like a polished, modern product that a startup founder will judge in 30 seconds, on a laptop and on a phone. Attached: screenshots of the current public page (desktop 1366 px; phone 390 px, inside a frame) and the current sign-in panel, plus every file under site/ and the front-end contract.

## Goals

1. **Visual identity and polish**, mostly in `site/style.css`:
   - A refined palette (you may keep the deep teal brand), consistent radii and soft shadows, a clear type scale, generous but efficient spacing. System font stack only: no web fonts, no external CSS.
   - Header: brand mark (a simple CSS/emoji-free mark or the wordmark) + tagline; "Sign in" and "Admin" as tidy nav links/buttons that stay visible on phones. A sticky header is fine.
   - Hero: strong headline, short subline; the four stats as compact tiles (2 columns on phones, 4 on desktop), numbers prominent, labels small.
   - Filters: a neat panel. On phones: search full width, the four selects in a 2-column grid, checkboxes and Clear on one row where they fit.
   - Job cards: clear hierarchy: title, company; then chips (cities, role, job type, "New"); the "Why it's here" line as a soft highlighted callout; posted date and source as muted meta; Apply as the primary button. For Adzuna posts, the "Jobs by Adzuna" label must stay visible next to Apply, at least 116×23 CSS px, and linked (it is a licence condition). Cards in a grid stay equal height, with hover and focus states.
   - Sections below the list (how it works, funnel table, sources, accuracy and cost, recent runs, removal contact): readable, with tables scrolling inside their own wrapper on small screens.
   - Panels (`me.html`, `admin.html`): the sign-in card centred, with one line on what the account gives (students: save and track jobs; admin: moderation). Tabs styled as a segmented control; tables, forms and the moderation `<details>` blocks consistent with the public page.
   - Dark mode through `prefers-color-scheme`, with good contrast.
2. **Phones**: nothing wider than the screen at 360 px; no horizontal scrolling of the page itself.
3. **Accessibility**: WCAG AA contrast, visible focus rings, tap targets at least 44 px, `prefers-reduced-motion` respected.

## Constraints (strict)

- Do not change data logic, Supabase calls, function names, exports or behaviour in `site/js/*.js`. Prefer CSS-only changes. You may add a class or a wrapper element in the HTML files, or a class name in the DOM-building code, only where the layout truly needs it; list every JS change in `notes`.
- Keep every `id` that the JS uses, and keep the existing class names working (restyle them; do not rename them).
- Keep the CSP meta tags exactly as they are. No new external resource of any kind. No innerHTML.
- Files you may return: `site/style.css`, `site/index.html`, `site/me.html`, `site/admin.html`, and files in `site/js/` only for class-name or wrapper changes. Never anything in `site/data/` or `site/samples/`.
- Return the full content of each file you change. Keep `style.css` under about 900 lines.

In `notes`, list the changes in a few lines, and any JS or HTML change with the reason.
