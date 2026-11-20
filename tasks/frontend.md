You are a senior front-end engineer. Build the front end of "Zero Se Shuru", a page of genuine fresher jobs and internships in India for college students (mostly on phones), plus a user panel and an admin panel.

The input contains these files:
- docs/FRONTEND_CONTRACT.md: your contract. Follow it exactly.
- docs/REQUIREMENTS.md and docs/ARCHITECTURE.md: the product requirements and design. Sections 9 and 10 matter most.
- Sample data: site/samples/meta.json and site/samples/jobs.json.

Return every file the contract lists, with complete contents and no placeholders:
- site/index.html, site/me.html, site/admin.html
- site/style.css
- site/js/common.js, site/js/app.js, site/js/me.js, site/js/admin.js, site/js/supa.js, site/js/config.example.js

Rules:
- Plain HTML, CSS and ES modules. No framework, no build step, no npm packages. The only external import is https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm, and only in js/supa.js. supa.js must not throw when the config is empty; it then exports supa = null.
- Each HTML page:
  - loads js/config.js as a classic script first, wrapped so that a missing file does nothing;
  - then loads its module;
  - has a CSP meta tag: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://*.supabase.co; img-src 'self' data:; style-src 'self'.
- Security:
  - Data goes into the page only through textContent and createElement. Never use innerHTML, outerHTML or insertAdjacentHTML with data.
  - Use href only for https:// URLs.
  - No inline event handlers and no inline style attributes; use classes.
- Design: phone first (360 px), tap targets of at least 44 px, visible focus rings, light and dark themes through CSS variables and prefers-color-scheme. A calm, modern look a startup founder would respect: one accent colour, good spacing, readable type, cards with clear hierarchy. Plain text, no emoji except the save star.
- Performance: render 50 cards, then "Show more". Debounce search by 150 ms.
- Robustness: if data/meta.json or data/jobs.json fails, show a clear error line. If Supabase is down or not configured, the public page still works and the panel links are hidden.
- The "Jobs by Adzuna" badge is visible on every Adzuna card: at least 116×23 px, linking to https://www.adzuna.in.
- Admin actions (hide post, block company, fix tags, board switch) each ask for a short reason, write to the Supabase tables in the contract, and show the result. Use upsert where the primary key may already exist.
- Show times in IST using Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata' }).

In "notes": list anything you could not do, and every assumption you made.
