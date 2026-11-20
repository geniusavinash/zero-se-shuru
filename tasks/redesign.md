You are the front-end worker on this repo. Redesign the public site in the style of the owner's mockup (first image: a job portal with a sticky header, a big hero search, a value strip, cards with a monogram, "How it works" with a call-to-action card, a numbers strip and a dark green footer). The second and third images are the current page on a laptop and a phone. Keep this site's green palette, light and dark themes, and brand **Zero Se Shuru**. Return the full content of each file you change or add.

Files you may change: `site/index.html`, `site/me.html`, `site/admin.html`, `site/style.css`, `site/js/app.js`, `site/js/common.js`. Add `site/privacy.html`. Do not change `me.js`, `admin.js`, `supa.js`, the data files or the CSP.

## The one hard rule: everything on the page must be true

The mockup is a style reference, not content. Do not copy its claims. There is no "10K+ jobs", no "happy candidates", no rating, no "24/7 support", no "100% secure", no "Easy Apply" (we do not host applications: Apply opens the company's page), no salaries (the data has none), no company logos (the data has none), no notification bell, no Twitter, YouTube or LinkedIn links, no Terms or Help pages, and no person photo. Every number is computed from the data on the page. Do not show the recent runs table on the public page: it lives in the admin panel.

## All pages: header and footer

- **Header** (sticky, white, a thin bottom border): the existing `.brand` logo mark and name on the left. On index.html, nav links "Jobs" (`#jobs`), "How it works" (`#how`), "Contact" (`#contact`); on the other pages "Browse jobs" (`index.html`) plus their current links. On the right, the account button as a dark green pill: on index.html it is the existing `#panel-links` link "Sign in" (the code that renames it "Your panel" must keep working, and it stays hidden until the panels are confirmed, as now).
- At 768 px and below the nav collapses behind a "Menu" button (a hamburger icon with visible or visually hidden text "Menu"), with `aria-expanded` and `aria-controls`; it closes on a link click and on Escape. The account button stays visible beside it. On me.html and admin.html, where there is no page script to edit, a two-link nav may simply wrap instead.
- **Footer** (dark green, light text, comfortable spacing):
  - the logo mark, "Zero Se Shuru" and the line "Start from zero.";
  - links: "How we pick jobs" (`#how`, or `index.html#how` on other pages), "Privacy" (`privacy.html`), "Request a removal" (`#contact`, or `index.html#contact`), and a GitHub icon link with the accessible name "Source code on GitHub" → https://github.com/geniusavinash/zero-se-shuru;
  - on index.html, `<div id="contact">` holds the existing `removalContact(meta)` paragraph, and the small "Admin" link keeps its id `admin-link` and its hidden-until-panels behaviour;
  - the attribution link "Jobs by Adzuna" → https://www.adzuna.in;
  - "© 2026 Zero Se Shuru".

## index.html

1. **Hero** (two columns from 1024 px, one column below):
   - a small pill: "Only for freshers in India";
   - `<h1>`: "Find your first job." and, on a second line in the accent colour, "Start from zero.";
   - the line: "Internships, apprenticeships and fresher jobs, straight from companies' career pages and Adzuna. Checked every morning and evening.";
   - **the search bar**: one white rounded bar holding the search input (move the existing `#q` here; placeholder "Job title, skill, company or city"), a divider, the city select (move the existing `#city` here) and a "Search jobs" button. Put them in a `<form id="search">`; submitting applies the filters and scrolls to `#jobs`. Below 640 px the three stack, full width;
   - **"Popular:" chips** computed from the data: the 3 roles and the 2 cities (ignore `other_india`) with the most openings, labelled by name. A chip sets that one filter and scrolls to `#jobs`;
   - the freshness line from the data: "Updated 20 Nov, 5:06 pm IST · 2 h ago" (keep `#stale` and `#data-errors` right after it);
   - **right column, 1024 px and up only**: "Just added", the 3 most recently first-seen openings as small stacked cards (monogram, title, company, first city), slightly offset, on soft green shapes made with CSS gradients (no images). Each is a link to the job's apply URL (`https:` only, as the cards do). Hidden below 1024 px.
2. **Value strip**, four items, each with an inline SVG icon:
   - "Only fresher roles": "Internships, apprenticeships and jobs asking under 1 year.";
   - "Straight from the source": "Companies' own career pages and the Adzuna API.";
   - "Every card says why": "The line in the post that makes it fit.";
   - "Fresh twice a day": "Refreshed at 6:07 am and 7:07 pm IST, on its own."
3. **Openings** (`<section id="jobs">`): heading "Openings", the existing `#result-count` and `#save-status`, then a compact filter bar with the remaining controls (`#role`, `#type`, `#source`, `#recent`, `#remote`, `#clear`), then `#jobs-list` cards (rename the current `#jobs` container; update app.js) and `#more`. Cards: 1 column below 640 px, 2 from 640 px, 3 from 1024 px. Keep every control's id, label and behaviour; "Clear" also clears the hero search and city.
4. **How it works** (`<section id="how">`): three steps with icons, joined by arrows on desktop and stacked on a phone:
   - "1. We collect": "Openings from {N} company career pages and the Adzuna API, every morning and evening." ({N} is the sum of `boardsOk` over the non-Adzuna entries of `meta.sources`; if unknown, say "company career pages");
   - "2. We check": "Only posts in India that are open to freshers stay, and each card says why.";
   - "3. You apply": "On the company's own page. Sign in to save jobs and track where you applied.";
   - beside them, a dark green card: "Save jobs. Track every application." with a button "Create a free account" → me.html. When the panels are off, the button reads "Browse openings" → `#jobs`.
5. **Numbers strip**, four items with icons, all from the data the page shows: "Openings" (the list after live corrections), "Companies hiring" (distinct `companyKey`), "Cities" (distinct city ids, without `other_india` and `delhi_ncr`), "Company career pages read" ({N} as above). Show "—" when unknown. Replace the old hero figures (`publicStrip`) with this; update or replace that export.

## Cards (common.js `card()`, shared by the public page and both panels)

Restyle the card like the mockup without losing anything it shows now:
- a monogram square (the first letter of up to two words of the company name; colour from a small fixed palette chosen by a hash of `companyKey`, white text, AA contrast);
- the title (`h3`) and the company;
- top right: the "New" badge when `isNew`, otherwise the relative posted or first-seen time ("2 d ago") with a small clock icon;
- a meta row with small icons: job type (briefcase) and the city chips (pin), each chip still linking to its own `cityLinks` URL; then the role name as a chip;
- "Why it's here:" stays, as a tinted callout;
- the actions row: "Apply" (primary, with an arrow icon), the "Jobs by Adzuna" badge on Adzuna cards (at least 116×23 px), and the save star when signed in.
Keep the signature `card(job, tax, save)` and its output usable where me.js and admin.js append their own actions.

## privacy.html (new; same header and footer; this exact text, as headings and paragraphs)

- Title "Privacy — Zero Se Shuru"; `<h1>` "Privacy".
- "Browsing needs no account. The jobs list is public, and your filters live only in the address bar."
- `<h2>` "If you create an account" — "We store your email and password through Supabase Auth (the password is stored hashed). We also store what you choose to add: your name, college, graduation year, preferred roles and cities, and the jobs you save with their status and note."
- `<h2>` "Who can see it" — "Only you can read your profile and saved jobs: the database enforces it with row-level security. The site's admin sees only totals, such as the number of accounts and saves. The person who runs the site can open the database to keep the service working."
- `<h2>` "Where it is stored" — "In Supabase, in its Mumbai (India) region. The site itself is served by Cloudflare Pages, which keeps standard request logs."
- `<h2>` "What we do not do" — "No ads, no analytics or tracking scripts, and no selling or sharing of your data. Your browser keeps your sign-in session in local storage; nothing else is stored on your device."
- `<h2>` "Deleting your account" — "Ask through the removal contact below and we will delete your account, profile and saved jobs."
- `<h2>` "Job listings" — "Listings come from public sources: companies' own career pages and the Adzuna API. To have a listing removed, use the same contact."
- The contact paragraph: "Open an issue on GitHub" → https://github.com/geniusavinash/zero-se-shuru/issues/new
- "Last updated: 20 November 2026."
- `<meta name="description">` "How Zero Se Shuru handles your data." The same CSP and favicon as index.html; no script needed.

## Quality bar

- Mobile first, fully responsive: no horizontal scroll from 360 px to 1440 px; check 360, 390, 768, 1024, 1280 and 1440 px in your head as you write the CSS.
- Light and dark themes for every new section (extend the existing custom properties and the `prefers-color-scheme: dark` block); AA contrast; visible focus; tap targets at least 44 px; `prefers-reduced-motion` respected; no layout shift when data arrives (reserve space for the hero's "Just added" column and the numbers).
- Build every data node with the existing helpers (`h`, `link`, …); icons built in JS use `document.createElementNS`; never put data in innerHTML. Static SVG icons may sit in the HTML. No external fonts, images or scripts; keep the CSP as it is.
- Keep search, filters, URL state, live corrections, saving, the stale banner and the removal contact working exactly as now.

In `notes`, list each changed file in one line and anything you could not do.
