# Front-end contract (site/)

Read this file together with `docs/REQUIREMENTS.md` (M1–M18, §4–§6) and `docs/ARCHITECTURE.md` (§9 page, §10 panels).
The pipeline (written by someone else) produces the data files. The front end only reads them, plus Supabase.

## Hard rules

- Plain HTML, CSS and JavaScript ES modules. No framework, no bundler, no build step, no npm packages in the browser.
- The only external script: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm`, imported only by `site/js/supa.js`.
- Write data to the page with `textContent` / `createElement` only. Never `innerHTML` with data. Links only when the URL starts with `https://`.
- Phone first (360 px wide). Tap targets of at least 44 px. Visible focus. It must also look good on a desktop.
- Every page works when Supabase is down or not configured: the public list still renders from `data/jobs.json`.
- Times are shown in IST (Asia/Kolkata).
- Touch only files under `site/`.

## Files to build

| File | What |
|---|---|
| `site/index.html`, `site/js/app.js` | The public page (no login). |
| `site/me.html`, `site/js/me.js` | The user panel. |
| `site/admin.html`, `site/js/admin.js` | The admin panel. |
| `site/js/supa.js` | Creates the Supabase client from `window.ZSS_CONFIG`; exports `supa` (or `null`), `getSession()`, `signIn(email, password)`, `signUp(email, password)`, `signOut()`. |
| `site/js/common.js` | Shared helpers: loading the JSON files, IST date formatting, the card renderer, escaping-free DOM helpers. |
| `site/style.css` | All styles. Light and dark (prefers-color-scheme). |
| `site/js/config.example.js` | `window.ZSS_CONFIG = { supabaseUrl: "", supabaseKey: "", panels: false };` The pipeline writes the real `site/js/config.js` (gitignored) at build time. Every HTML page loads `js/config.js` with a classic `<script>` before the modules; if it is missing, treat the config as empty. |

## Data files (read with `fetch`, `cache: "no-cache"`)

- `data/jobs.json`: an array of rows.
- `data/meta.json`: one object, described below.
- `data/review.json`: an array of review items. Only the admin panel reads it.

Samples are in `site/samples/`. For local work, copy them into `site/data/` (that folder is gitignored) and run `npm run serve`, or any static server, from `site/`.

### A row of `jobs.json`

```ts
{
  key: string;            // "greenhouse:groww:4970739101" or "adzuna:3f9c..."
  title: string;
  company: string;
  companyKey: string;     // used by "block company"
  role: string;           // a role id; display names come from meta.roles
  cities: string[];       // city ids; display names come from meta.cities
  cityLinks: { city: string; url: string }[];   // one apply link per city when a card merges listings
  locationText: string;   // as the source wrote it
  remote: boolean;
  jobType: "internship" | "apprenticeship" | "full_time" | "part_time" | "contract" | "other";
  postedAt?: string;      // ISO UTC; absent when the source gives no date
  firstSeen: string;      // YYYY-MM-DD (IST)
  source: "greenhouse" | "lever" | "ashby" | "adzuna";
  aggregator: boolean;    // true for Adzuna
  url: string;            // the main apply link
  why: string;            // "why it's here": an evidence phrase, or the deciding fact
  isNew: boolean;         // first seen today
  overridden: boolean;    // an admin fixed its tags
  memberKeys: string[];   // keys merged into this card (for hide/fix matching too)
}
```

### `meta.json`

```ts
{
  site: { name, tagline, publicUrl, repoUrl, panels: boolean, contact: string, staleAfterHours: number },
  generatedAt: string,            // ISO UTC
  runId: string, trigger: "schedule" | "manual" | "local",
  counts: { shown, companies, newToday, duplicatesRemoved, cityMismatch },
  funnel: {
    total:    { read, india, candidates, tagged, eligible, afterDedupe, shown },
    bySource: { greenhouse: {...same keys}, lever: {...}, ashby: {...}, adzuna: {...} }
  },
  sources: [{ name, display, docs, terms, whyAllowed, attribution, boardsOk, boardsFailed, on }],
  boards:  [{ ats, token, company, on, ok, reason?, india, candidates, shown }],   // admin panel only
  metrics: null | {
    asOfRun, model, promptVersion,
    accuracy: { both: C, role: C, city: C },       // C = { correct, total, low, high } (low/high are 0–1)
    fresherShareBySource: { [source]: C },
    costPer1000Tagged: number, costPer1000Shown: number, consoleSpendUsd?: number
  },
  runs: [{ id, startedAt, trigger, ok, shown, newPosts, llmCalls, costUsd, blockedReason? }],  // newest first, 14 max
  roles:  [{ id, name }],
  cities: [{ id, name, aliases: string[] }],
  metroGroups: [{ id, name, cities: string[] }]
}
```

### A review item (`review.json`)

`{ key, title, company, source, url, reason: "city_mismatch" | "untagged" | "refused" | "incomplete", role?, llmCities: string[], ruleCities: string[] }`

## Supabase (see `db/schema.sql`)

| Table | Columns |
|---|---|
| `profiles` | `user_id`, `name`, `college`, `grad_year`, `roles` (text[] of role ids), `cities` (text[] of city ids) |
| `saved_jobs` | `user_id`, `job_key`, `status` (saved, applied, interview, offer, rejected), `note`, `updated_at` |
| `hidden_posts` | `job_key`, `reason` |
| `blocked_companies` | `company_key`, `reason` |
| `tag_fixes` | `job_key`, `role`, `cities`, `reason` |
| `board_switches` | `ats`, `token`, `is_on`, `reason` |

RPC calls:
- `is_admin()` returns a boolean.
- `admin_stats()` returns `{ users, profiles, saves_by_status }`, for admins only.

Sign-in is email and password, with no email confirmation.

## Public page (index.html)

1. **Top strip.** Four figures, each a link to its evidence:
   - post count → `#funnel`;
   - last refresh, IST, relative ("3 h ago") → `#runs`;
   - accuracy, "role+city both right: 46/50", or "not measured yet" → `#accuracy`;
   - cost per 1,000 posts → `#accuracy`.

   A warning banner shows when `generatedAt` is older than `site.staleAfterHours`.
2. **Search.** A box that matches the start of words in the title, company, location text, role name, city names and city aliases.
3. **Filters.**
   - Role (with counts).
   - City (with counts; the metro groups Delhi NCR and Mumbai region as options).
   - Job type.
   - Source type: company site or Adzuna.
   - Posted within 7 days.
   - Remote.

   Keep the filter state in the URL query, and show a "Clear" button.
4. **Cards**, 50 at first, then "Show more". Each card has:
   - the title;
   - the company;
   - city chips, each linking to its own `cityLinks` URL;
   - the role name and job type;
   - "Posted <date>" or "First seen <date>";
   - a "New" badge when `isNew`;
   - "Why it's here: <why>";
   - the source;
   - an Apply button.
   - Adzuna cards also carry a visible "Jobs by Adzuna" badge, at least 116×23 px, linking to https://www.adzuna.in.
   - When the panels are on and the user is signed in, a ☆ save button.
5. **Live corrections.** If Supabase is configured, read `hidden_posts`, `blocked_companies` and `tag_fixes`:
   - drop hidden keys (checking `memberKeys` too) and blocked `companyKey`s;
   - apply tag fixes (role and cities).

   Fail silently to the plain list.
6. **How it works** (`#how`):
   - the pipeline in 6 short lines;
   - `#funnel`: a table, total and per source;
   - `#sources`: name, docs and terms links, why it is allowed, attribution;
   - `#accuracy`: the metrics with intervals as "92% (81–97%)", the model and prompt version, "as of run X";
   - `#runs`: the last 14 runs, with time in IST, scheduled or manual, shown, new and cost; a red mark for failed runs with their `blockedReason`;
   - the removal contact.
7. **Header.** The name, the tagline, and, when `site.panels`, "Sign in" (→ me.html) and "Admin" (→ admin.html) links.

## User panel (me.html)

- Signed out: a sign-in / sign-up form (email, password).
- Signed in, with these tabs:
  - **Profile:** name, college, graduation year, preferred roles (checkboxes from `meta.roles`), preferred cities (from `meta.cities`).
  - **For you:** the public cards filtered by the profile's roles and cities, reusing the card renderer.
  - **Saved:** saved jobs. A status select (saved → applied → interview → offer or rejected) and a note, saved to `saved_jobs`. A saved key missing from today's `jobs.json` shows as "no longer listed".
- Sign out.

## Admin panel (admin.html)

- Sign-in form. After sign-in, call `is_admin()`. If it is false, show "This account is not an admin" and nothing else.
- **Dashboard:** the top-strip numbers, the funnel, the sources with boards OK/failed, the runs table, and `admin_stats()` counts.
- **Review queue:** the items of `review.json`, with LLM cities and rule cities side by side. Each item has three actions:
  - Hide post → `hidden_posts`;
  - Block company → `blocked_companies`;
  - Fix tags → `tag_fixes`, with a role select and city multi-select.

  Every action asks for a short reason. Undo removes the row.
- **Posts:** search all shown posts (from `jobs.json`) and apply the same three actions.
- **Boards:** `meta.boards` as a table (status, India, candidates, shown) with an on/off switch → `board_switches` upsert. The page notes that this takes effect at the next refresh.
- **Run now:** a link to `<repoUrl>/actions/workflows/refresh.yml`.

## Done when

- With the samples copied into `site/data/`, all three pages work at 360 px and on desktop.
- With no `config.js`, the public page works and the panel links are hidden.
- There is no `innerHTML` with data anywhere: `grep -n "innerHTML" site/js` shows nothing, or only constant strings.
