You are the front-end worker on this repo. The owner wants the public page to look and read like a production job site for students. The evidence a reviewer wants (funnel, sources table, accuracy and cost, run history) moves to a new tab in the admin panel. `docs/FRONTEND_CONTRACT.md` (attached) is already updated: follow its "Public page" and "Admin panel" sections. Return the full content of each file you change or add.

Files you may change: `site/index.html`, `site/admin.html`, `site/me.html`, `site/js/app.js`, `site/js/admin.js`, `site/js/common.js`, `site/style.css`. You may add `site/favicon.svg`. Nothing else.

## 1. Public page (index.html, app.js, common.js)

1. Remove the `<section id="how" class="evidence">` block (the "How it works" list and `#evidence`) and the `evidence($('evidence'), meta, tax)` call in app.js. The public page no longer calls `evidence()`.
2. Header nav: keep only the "Sign in" link (the code that renames it "Your panel" for a signed-in user must keep working). The "Admin" link moves to the footer.
3. Top strip: three plain figures, not links: "Openings" (the number of posts the page lists, after live corrections), "Companies hiring" (distinct companies in that same list, by `companyKey`, falling back to `meta.counts.companies` when the list is unavailable), and "Updated" (IST time with the relative time, as the current "Last refresh" tile shows it). Add this as a new export in common.js (for example `publicStrip`) and keep the existing four-figure `strip()` unchanged for the admin dashboard.
4. Stale banner text: "This list is older than expected. Confirm the opening on the company's page before applying."
5. Add a `<footer class="site-footer">` after `</main>`, inside a `.wrap`, with:
   - a heading "How we pick jobs" and this paragraph: "Openings come from companies' own career pages and from Adzuna. We keep only posts in India that are open to freshers: internships, apprenticeships, roles asking for under 1 year of experience, or posts that invite freshers. The list refreshes every morning and evening, and every card says why it is here."
   - a line with the attribution link "Jobs by Adzuna" → https://www.adzuna.in;
   - the removal contact, filled by JS: move the "Request a removal" rendering out of `evidence()` into a new export in common.js (for example `removalContact(meta)` returning one paragraph node), keeping its logic and wording, prefixed with "Want a listing removed? ". `evidence()` no longer renders the contact;
   - a small "Admin" link (→ admin.html), hidden unless the panels are on, shown by the same code that shows `#panel-links`;
   - "Zero Se Shuru · 2026".
6. Production touches:
   - index.html: `<meta name="description" content="Real fresher jobs and internships in India, from companies' own career pages and Adzuna, refreshed every morning and evening.">` and Open Graph tags: `og:title` "Zero Se Shuru — Fresher jobs in India", `og:description` (same text), `og:type` website, `og:url` https://zero-se-shuru.pages.dev/.
   - admin.html and me.html: `<meta name="robots" content="noindex">`.
   - A new `site/favicon.svg`: a simple original monogram in the page's accent colour (plain SVG: no script, no external reference, no embedded font), linked from all three pages with `<link rel="icon" href="favicon.svg" type="image/svg+xml">`. The CSP already allows `img-src 'self'`; do not change the CSP.

## 2. Admin panel (admin.js)

1. Tabs become `['Dashboard', 'Quality & runs', 'Review queue', 'Posts', 'Overrides', 'Boards']`. Update the destructuring and the `onChange` index that repaints the Overrides tab (it is now 4).
2. Dashboard keeps the four-figure summary strip, the stale notice, the "Run now" link and the account counts. Move `evidence(details, meta, tax, true)` out of it.
3. "Quality & runs" gets: one intro line, "How the published list is made, how well it is tagged, what it costs, and every recent run."; the pipeline as an ordered list with the same six lines that were removed from index.html (built with `h`); then `evidence(…, true)`.
4. The four summary tiles link to `#funnel`, `#runs` and `#accuracy`, which are now inside the Quality & runs tab. Make a click on a tile open that tab and scroll to the section (prevent the default jump while the tab is hidden).

## 3. Style (style.css)

- Style the footer to match the current design: muted text, a top border, comfortable spacing, readable at 360 px and in dark mode, and links with visible focus.
- The public strip has three tiles: keep it balanced on desktop and on a phone.
- Remove CSS only when nothing uses it any more; the admin tab still uses the evidence section and table styles.

## Rules

- Build every node with the existing helpers (`h`, `link`, `table`, …); never put data in innerHTML.
- Do not change the search, filters, cards, live corrections, saving, the Supabase calls, me.js or the data files.
- Keep tap targets at least 44 px and the existing accessibility (labels, `role="status"`, focus styles).

In `notes`, list each changed file in one line, and anything in this task you could not do.
