# Zero Se Shuru — System design (v2.1)

Written 2026-11-20 and revised after two independent reviews and the owner's decision to add panels. It replaces v1's design, which is archived in `resources/old-v1-plan/`.

## 1. Why a fresh, small build

v1 (in `resources/old-v1-code/`) has about 13,600 lines of source and as many again in tests. It was written in a sandbox with no network, so none of it ever ran against a real source, the LLM, GitHub Actions or Cloudflare. The founder will ask for a live change on a call.

v2 keeps v1's knowledge: the 177-board seed list, the city table with aliases and Indian states, the role list, the field rules of the prompt, and the bugs its reviews found (§14). It drops v1's machinery: the freeze/promote/gate chain, HMAC keys, the 11-rule gate and the heartbeat pings.

v2 is built against live data from the first hour.

## 2. Overview

```
GitHub Actions: cron 06:07 and 19:07 IST, or "Run workflow" (input dry_run)
└─ npm run refresh
   0 overrides  read the admin's changes from Supabase (public read): boards off,
                hidden posts, blocked companies, tag fixes
   1 collect    Greenhouse · Lever · Ashby (177 boards) + Adzuna India API
   2 normalise  every post → one Job shape
   3 filter     India · not senior · ≤60 days · not junk · not hidden or blocked   (rules)
   4 tag        gpt-6-luna (Azure OpenAI), one call per post, JSON schema, cached  (LLM)
   5 decide     shown or not, with a reason; tag fixes applied and marked          (code)
   6 dedupe     same post; same company + title (+ city)
   7 build      site/data/jobs.json, meta.json, review.json, plus the data/ files
├─ commit data/  tag cache, first-seen dates, run log, call log, metrics
│                (the run record is committed even when the run is blocked)
└─ deploy site/  Cloudflare Pages, production branch main

Browser
  index.html  public list, no login     ← jobs.json, plus the live hidden/fix lists from Supabase
  me.html     user panel                ← Supabase Auth; profiles, saved_jobs (each user sees only their rows)
  admin.html  admin panel               ← Supabase Auth + is_admin(); writes overrides; reads meta and review.json
```

On the laptop: `npm run refresh`, then `npm run serve`.

## 3. Sources

Greenhouse, Lever and Ashby were checked live on 2026-11-20. Adzuna is checked at T6.

### Greenhouse
- **Call:** `GET boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`. One call per board; the description comes in the list.
- **Fields:** `id`, `title`, `company_name` (present on every job, so there is no separate board call), `location.name`, `offices[].name`, `first_published`, `content` (HTML with escaped entities), `absolute_url`.
- `updated_at` is not a posting date.

### Lever
- **Call:** `GET api.lever.co/v0/postings/{site}?mode=json`
- **Fields:** `id`, `text`, `categories.location`, `categories.allLocations`, `categories.commitment`, `country`, `workplaceType`, `createdAt` (milliseconds), `hostedUrl`.
- **Description:** joined from `openingPlain`, `descriptionBodyPlain`, `descriptionPlain`, `lists[].text`/`content` and `additionalPlain`. `descriptionPlain` came back empty on a live post.
- **Company name:** from config.

### Ashby
- **Call:** `GET api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=false`
- **Fields:** `id`, `title`, `location`, `secondaryLocations[].location`, `address.postalAddress.addressCountry`, `isListed`, `workplaceType`, `employmentType`, `publishedAt`, `descriptionPlain`, `jobUrl`.
- Skip posts with `isListed: false`. `isRemote` is also true for hybrid jobs, so read `workplaceType` instead.
- **Company name:** from config.

### Adzuna
- **Call:** `GET api.adzuna.com/v1/api/jobs/in/search/{page}?app_id&app_key&what=…&results_per_page=…&content-type=application/json`
- **Fields:** `id`, `title`, `company.display_name`, `location.display_name`, `location.area[]`, `description` (a snippet only), `created`, `redirect_url`, `contract_time`, plus the top-level `count`.
- **Parameters:** the official search page documents `what`, `what_exclude`, `where`, `sort_by`, `results_per_page`, `full_time`, `permanent` and `content-type`. Others (`what_or`, `max_days_old`, `sort_by=date`, 50 per page) are kept only if `count` or the rows change when they are added. A 200 answer does not prove a parameter worked.
- **Queries:** intern, internship, fresher, trainee, graduate trainee, apprentice. At most 3 pages each, 3 s apart.
- **Attribution (terms, checked):** the word "Adzuna" on every Adzuna listing, at least 116×23 px, linked to adzuna.in.
- The `app_key` travels in the URL, so logs show the host and path only.

### Board list
`config/boards.csv` has the columns ats, token, company, on, with the 177 seed rows. Greenhouse names come from `company_name`. Lever and Ashby names are fixed by hand during T3 for every board that has India candidates. Two very large boards with few India posts start switched off: lever `tsmg` and ashby `bjakcareer`.

## 4. Data shapes (`src/types.ts`)

- **Job:** `{ key, source, board, sourceId, title, company, locations[], country?, workplace?, employment?, description, postedAt?, url, aggregator }`. The key is `source:board:id`; for Adzuna it is `adzuna:<sha256(id)[:16]>`.
- **Tags** (from the LLM): `{ role, cities[], location_status, in_india, job_type, min_experience_years | null, invites_freshers, genuine, evidence }`.
- **Row** (one card): `{ key, title, company, role, cities[], cityLinks[], locationText, remote, jobType, postedAt?, firstSeen, source, aggregator, url, why, isNew, overridden }`.
- **Review item:** `{ key, title, company, source, reason: city_mismatch | untagged | refused | cut_off, llmCities[], ruleCities[] }`.
- **Run:** `{ id, startedAt, finishedAt, trigger: schedule | manual | local, ok, blockedReason?, counts, perSource, llm }`.
  - `counts`: read, india, candidates, tagged, eligible, duplicates, shown, cityMismatch.
  - `llm`: calls, cacheHits, failed, input, output, cacheRead, cacheWrite, costUsd.
- **Metrics** (`data/metrics.json`): `{ runId, model, promptVersion, accuracy: {both, role, city: {correct, total, low, high}}, fresherShareBySource, costPer1000Tagged, costPer1000Shown, consoleSpendUsd? }`.

## 5. Files

| File | What it does | ≈ lines |
|---|---|---|
| `src/env.ts` | Reads the keys from environment variables: Windows user variables on the laptop, secrets in Actions. Loads `.env` only if one exists. When a key is missing it stops and names the variable. | 20 |
| `src/http.ts` | `getJson` with the User-Agent and contact; one queue per host; 1 s gap; 30 s timeout; 2 retries on 5xx or timeout; a 429 or 403 stops that host; logs host and path only. | 90 |
| `src/sources/greenhouse.ts`, `lever.ts`, `ashby.ts`, `adzuna.ts` | Map each post to a Job. A bad post is skipped and counted, never the whole board. | 4 × 60 |
| `src/overrides.ts` | Reads the Supabase override tables over REST with the publishable key. If Supabase is down, the run continues without overrides and logs a warning. | 60 |
| `src/text.ts` | HTML to text; strips emails and phone numbers (never number ranges); company and title keys. | 80 |
| `src/india.ts` | Location strings and country → in India, cities, remote. | 150 |
| `src/prefilter.ts` | Senior and junk title rules, age, per-company candidate cap. | 90 |
| `src/excerpt.ts` | At most 1,500 characters for the LLM, experience sentences first. | 40 |
| `src/llm.ts` | The OpenAI SDK against the Azure OpenAI v1 endpoint: one Responses API call with a strict JSON schema; usage → cost. | 80 |
| `src/tagger.ts` | Cache, concurrency, pacing to RPM and OTPM, call log, an ETA. | 120 |
| `src/decide.ts` | Eligibility from the tags, with a reason. | 40 |
| `src/dedupe.ts` | The three merge rules. | 80 |
| `src/build.ts` | `jobs.json`, `meta.json`, `review.json`, the run record, first-seen dates. | 120 |
| `src/run.ts` | Orchestrator: `main()`, called unconditionally. Flags: `--limit N --seed S`, `--source X`, `--no-llm`, `--offline`, `--dry-run`. | 150 |
| `src/eval/sample.ts`, `src/eval/score.ts`, `src/cost.ts`, `src/export.ts` | The 50-post check, metrics, and the sheet CSVs. | 330 |
| `db/schema.sql` | Supabase tables, row-level security, `is_admin()`, `admin_stats()`. | 120 |
| `site/index.html`, `site/js/app.js`, `site/style.css` | The public page. | 80 + 350 + 200 |
| `site/me.html`, `site/js/me.js` | The user panel. | 60 + 250 |
| `site/admin.html`, `site/js/admin.js` | The admin panel. | 60 + 350 |
| `site/js/supa.js` | Supabase client (supabase-js 2.119 from the CDN, pinned) and the session helper. | 40 |
| `.github/workflows/refresh.yml` | The daily job. | 70 |
| `tests/*.test.ts` | india, prefilter, decide, dedupe, text, and the parsers on saved real responses. | 400 |

### Config (YAML with comments, so it can be changed live)
- `config/boards.csv`: the board list.
- `config/site.yaml`: name, URL, contact, `min_shown`, `panels`, caps.
- `config/rules.yaml`: senior words, junk phrases, experience limit, age.
- `config/taxonomy.yaml`: roles, cities with aliases, states, foreign markers.
- `config/model.yaml`: model, effort, `max_tokens`, RPM, OTPM, prices, prompt version.

### Packages (installed)
- Runtime: `openai` 7.62, `zod` 4.6, `he` 2.0, `yaml` 2.9.
- Dev: `tsx`, `typescript` 7.0, `vitest` 5.1, `wrangler` 4.165, `@types/node`.

## 6. Rules: cheap filters before the LLM

- **India.** A post is in India when either holds:
  - its country field is IN or India;
  - a location piece names India, an Indian state, or a listed city or alias, and that same piece has no foreign marker (another country, a US state, or a ", XX" US state code other than IN).

  So "Delhi, IN" is India and "Indianapolis, IN" is not. "Remote" counts only together with India, or when no country is given.
- **Title: drop.** Any of: senior, sr, lead, principal, staff, head, director, vp, architect, manager, II, III, IV, SDE 2 and above; "N+ years"; a range that starts at 2 or more.
  Exception: when the title also has an entry word (intern, trainee, fresher, graduate, apprentice, campus), it goes to the LLM instead of being dropped.
- **Title: junk.** talent pool, general application, future opportunities, walk-in, registration fee, earn from home.
- **Age.** Posted more than 60 days ago is dropped. A post with no date is kept.
- **Caps.**
  - At most 40 LLM candidates per company per run: titles with an entry word first, then the newest. The cap drops to 20 if the ETA is over 45 minutes.
  - At most 20 posts shown per company.
  - At most 400 Adzuna posts shown.

## 7. LLM tagging

- **Client.** The `openai` SDK, pointed at the Azure OpenAI v1 endpoint (the base URL is in `config/model.yaml`). It uses the Responses API with `text.format = {type: "json_schema", strict: true, schema}`. The answer is read from `output_text` and checked again with zod.
- **Model.** The deployment `gpt-6-luna`, with `reasoning.effort: "low"` and `max_output_tokens: 1000`. Reasoning tokens count toward that limit.
- **Prices.** Per million tokens: $0.10 input, $0.01 cached input, $0.50 output. They come from the owner's Azure price sheet; confirm them in the Azure portal before reporting.
- **Caching.** Azure caches a repeated prompt prefix of 1,024 tokens or more on its own, so the long, fixed instructions go first and the post goes last. `usage.input_tokens_details.cached_tokens` shows the hits.
- **Key.** `AZURE_OPENAI_API_KEY`: Key 1 on the laptop, Key 2 in GitHub Actions. If it is missing, the run stops and names the variable.
- **Prompt.** `prompts/tag.md` (version v1), with the role and city lists filled in, is sent as `instructions`. The input is `<post>`title, company, locations, employment type, excerpt`</post>`.
- **Roles (17).** software_development, data_analytics_ai, qa_testing, it_cloud_security, non_software_engineering, design_creative, product_project, marketing, content_writing, sales_bd, customer_support, operations_admin, finance_accounting, hr_recruitment, education_research, legal_compliance, other.
- **Cache.**
  - Key: `sha256(model + prompt version + source:board:id + title + locations + raw description)`. The company name is not part of the key, so fixing a name never forces a re-tag.
  - Each answer is appended to `data/tag_cache.jsonl` as it arrives, so a stopped run loses nothing.
  - Only tags are stored. For Adzuna posts there is no evidence text.
- **Pacing.** Paced to the deployment's requests and tokens per minute (`model.yaml`), adjusted from the `x-ratelimit-*` headers Azure returns. The run prints an ETA before the first call.
- **Actions limit.** At most 300 new tags or 15 minutes per Actions run. The first full run happens on the laptop.
- **Log.** `data/llm_calls.jsonl` gets one line per call: time, run id, key hash, model, the four token counts, cost and status.

## 8. Decide, then dedupe

**Decide.** The first rule that matches wins, and every post gets a reason.

1. Hidden by the admin, or its company is blocked → hide.
2. Not tagged → hide (the post goes to the review queue).
3. `genuine` is not ok → hide.
4. `in_india` is false → hide.
5. Job type `other` (commission-only, volunteer, ambassador, freelance gig) → hide.
6. Internship or apprenticeship → show.
7. A minimum experience is stated → show if it is under 1 year, otherwise hide.
8. Invites freshers → show.
9. Anything else → hide as "unclear".

Admin tag fixes replace the LLM's role and cities. The post is marked `overridden` and left out of the accuracy figures.

**Dedupe.**

1. Same key → keep one.
2. Same company key, title key and job type within one source → one card. The cities are merged, and each city keeps its own link.
3. The same match across sources, when the posts share a city or neither names one → the company-board post wins over Adzuna.

The number removed and the merged pairs go to `meta.json`.

## 9. Public page (`site/index.html`)

The public page is the product a student uses; the evidence lives in the admin panel's Quality & runs tab (owner's decision, 2026-11-20, `docs/DECISIONS.md`).

- **Top strip.** Openings, companies hiring, and the last refresh (IST). It warns when the data is more than 30 hours old.
- **Search and filters.** Role, city (with counts), job type, source type (company site or Adzuna), posted within 7 days.
- **Card.** Title, company, cities, role, job type, posted or first-seen date, "why it's here", source and an Apply link.
  - Adzuna cards carry a "Jobs by Adzuna" badge, at least 116×23 px, linked to adzuna.in.
  - 50 cards show at first, then "Show more".
- **Footer.** "How we pick jobs" in three sentences, the "Jobs by Adzuna" attribution, and the removal contact.
- **Admin panel, Quality & runs tab.**
  - The pipeline in six lines and the funnel per source.
  - A sources table: docs, terms, why each source is allowed, boards OK and failed.
  - Accuracy and cost, from `metrics.json`, with who labelled the 50-post check.
  - The last 14 runs.
- **Panels.** A "Sign in" link (user panel) in the header and a small "Admin" link in the footer appear only when `panels: true`.
- **Live corrections.** On load, the page reads the hidden posts and tag fixes from Supabase, so a fix shows at once. If Supabase is down, the page still renders from `jobs.json`.
- **Safety.** Phone first. Data is written with `textContent` only.

## 10. Panels (Supabase)

### Auth
- Email and password, with "confirm email" switched off so reviewers can try it at once. Google sign-in is S2.
- The publishable (anon) key is public by design and is written into `site/js/config.js` at build time.
- The secret (service role) key is not used by the app.

### Tables, with row-level security
| Table | Who can read | Who can write |
|---|---|---|
| `profiles` (user_id, name, grad_year, roles[], cities[]) | the owner of the row | the owner of the row |
| `saved_jobs` (user_id, job_key, status, note, updated_at) | the owner of the row | the owner of the row |
| `hidden_posts` (job_key, reason, by_email, at) | anyone | admins |
| `blocked_companies` (company_key, …) | anyone | admins |
| `tag_fixes` (job_key, role, cities[], …) | anyone | admins |
| `board_switches` (ats, token, on, …) | anyone | admins |
| `admins` (email) | nobody directly, only through `is_admin()` | nobody directly |

Helper functions:
- `is_admin()`: a security-definer function that checks `auth.jwt()->>'email'` against `admins`.
- `admin_stats()`: returns counts only (users, saves by status), and only when `is_admin()` is true.

### User panel (`me.html`)
- Sign up and sign in.
- Profile.
- "For you": `jobs.json` filtered by the profile's roles and cities.
- Saved jobs, each with a status (saved → applied → interview → offer or rejected) and a note.

### Admin panel (`admin.html`)
- **Dashboard:** from `meta.json` and `metrics.json`.
- **Review queue:** from `review.json`. For each post the admin can hide it, block its company, or fix its role and cities.
- **Boards:** a table with each board's last status and an on/off switch. A switch takes effect at the next refresh.
- **Users:** `admin_stats()`.
- **Run now:** a link to the workflow's "Run workflow" page.

### Demo access
Reviewers can sign up themselves. A demo admin account's credentials go only into the private submission form. Admin actions are logged and can be undone.

## 11. Daily job (`.github/workflows/refresh.yml`)

- **Triggers:**
  - cron `37 0 * * *` (06:07 IST);
  - cron `37 13 * * *` (19:07 IST);
  - `workflow_dispatch` with the input `dry_run` (no LLM calls, `min_shown` 0, used to prove the deploy path).
- **The job** (timeout 30 min, concurrency group `refresh`, `permissions: contents: write`):
  1. `checkout@v7`.
  2. `setup-node@v7` (Node 24, npm cache).
  3. `npm ci`.
  4. Set git `user.name` and `user.email` for the bot.
  5. `npm run refresh`.
  6. Commit `data/`, pull with rebase, push.
  7. `npx wrangler pages deploy site --project-name=zero-se-shuru --branch=main`.
- **Secrets:** `AZURE_OPENAI_API_KEY` (Key 2), `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `CONTACT_EMAIL`.
- **Safety:** the refresh exits non-zero when fewer than `min_shown` (150) posts would be shown, or when every company-board source failed. Even then, the run record and the call log are committed. Nothing is deployed, so yesterday's page stays up, and GitHub marks the run red.
- **One writer:** after T13, only CI writes `data/` and deploys. The laptop runs locally and previews.

## 12. Where things run, and the secrets

- **Laptop** (Windows, Node 24): the repo lives at `myskill\zero-se-shuru`, inside OneDrive.
  - `node_modules` and `.cache` are junctions to `C:\dev\zero-se-shuru-deps`, so OneDrive never uploads them.
  - `npm install` run in the repo replaces the junction with a real folder. Packages are therefore changed only through `tools\npm.ps1`, which runs npm in `C:\dev\zero-se-shuru-deps` and copies the manifest back.
  - The keys are Windows user environment variables, set with `tools\set-keys.ps1`. There is no `.env` file.
  - Codex uses the same `AZURE_OPENAI_API_KEY`, with its profiles in `~\.codex\<name>.config.toml`.
- **GitHub:** a private repo until submission. The repo, the secrets and workflow runs are handled with the gh CLI. No branch protection on main, because the bot pushes.
- **Cloudflare Pages:**
  - Create the project once with `wrangler pages project create zero-se-shuru --production-branch=main`.
  - `wrangler pages deployment list` must show Production.
  - The URL Cloudflare assigns goes into `site.yaml`.
- **Supabase:** one project in the Mumbai region. `db/schema.sql` is run once in the SQL editor.
- **Repo hygiene:** `.gitattributes` sets `* text=auto eol=lf`. Before each push, the staged files are searched for every `.env` value.
- **Never in git:** `.env`, `.cache/`, `site/data/`, `site/js/config.js`, `eval/private_labels.csv`.

## 13. The AI team (how it is built)

| Role | Who | Owns |
|---|---|---|
| Lead | Claude Code (Opus 5.5) | The plan, the pipeline, `db/schema.sql`, integration, tests, deploy, final checks. |
| Front-end worker | Codex with gpt-6.2-sol | `site/` (page and panels), built against a written contract: the `jobs.json` sample, the table list and the `supa.js` API. |
| Reviewer | Codex with gpt-6.2-astra | Two independent code reviews: after T8, and before submission. |
| Text | gpt-6-luna | Polishing the README and the Loom script. |

Rules:
- Every worker owns separate files.
- Claude Code reads, tests and fixes everything before it is merged.
- Every prompt goes to `docs/PROMPTS.md`.
- Codex runs as `codex exec -p <profile>`: the app's CLI (0.171) with the profiles sol, astra, terra and luna on Azure, set up and tested on 2026-11-20. If it is unavailable, Claude Code subagents take the worker roles.

## 14. Lessons from v1, and from today's live checks

- **Greenhouse:** `?content=true` gives the descriptions, and `company_name` is on each job (seen live).
- **Lever:** `descriptionPlain` can be empty (seen live). `createdAt` is in milliseconds.
- **Ashby:** `isRemote` is also true for hybrid jobs. There is no company name in the payload.
- **Locations:** ", IN" can mean Indiana.
- **Phone stripping:** it must not eat ranges such as "300000 - 450000" or "3-5 years".
- **Titles:** "Head of Internships" and "Campus Hiring Manager" go to the LLM.
- **Company names:** board tokens are not names (digitalocean98, razorpaysoftwareprivatelimited).
- **Bad posts:** one bad post must not drop a board.
- **Windows → CI:**
  - `--env-file` fails in Actions, where there is no `.env` file.
  - A main-guard that compares paths fails silently when the drive letter's case differs, so `main()` is called unconditionally.
- **Deploys:** a wrangler deploy without a production branch lands on a preview URL.
- **Commits:** anything not committed is wiped by the next CI run. That covers numbers, first-seen dates and the cache.

## 15. Where to change what (for the live call)

| Change | Where |
|---|---|
| Fresher rule (for example, up to 1 year) | `config/rules.yaml` `experience_limit_years`, read by `src/decide.ts`. No new LLM calls are needed. |
| Add or remove a company | `config/boards.csv`, or the admin panel's board switch |
| Hide a bad post or fix a tag | The admin panel (takes effect at once) |
| Add a source | A new file in `src/sources/`, registered in `src/run.ts` |
| A new role or city | `config/taxonomy.yaml`, then bump the prompt version and re-tag |
| A new filter | `site/js/app.js`: the filter state, then render |
| Try another model | `npm run eval:rerun -- --model <id>` (S3) |

## 16. Risks

| Risk | How we see it | What we do |
|---|---|---|
| Fewer than 200 eligible posts | The projected count at T5; the count at T8 | Use the levers in TASKS before T8. |
| Azure rate limits (requests or tokens per minute) | The ETA, 429s in the log, the `x-ratelimit-*` headers | `max_output_tokens` 1000, the per-company cap at 20, pacing. |
| `npm install` breaks the junction | `node_modules` becomes a real folder in OneDrive | Change packages only through `tools\npm.ps1`. |
| Deploys land on preview only | `deployment list` shows no Production | Create the project with `--production-branch=main`. |
| CI wipes uncommitted data | Numbers missing after the next run | Commit `metrics.json`, `first_seen.json` and the cache. |
| A board returns 404 or 403 | The collect table | Switch it off. |
| Adzuna is down | Query errors | Publish from the boards alone if at least 150 posts remain. |
| The panels slip | Not working end to end by 21:30 | Set `panels: false`. Submission is unaffected. |
| The scheduled run is late | Actions history | Run it by hand and say so in the Loom. |
