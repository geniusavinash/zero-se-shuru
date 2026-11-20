# Zero Se Shuru — Requirements (v2.1)

Written 2026-11-20 and revised the same day after two independent reviews (one from the founder's view, one from an engineer's view) and the owner's decision to add user and admin panels. This file replaces the v1 plan, which is archived in `resources/old-v1-plan/`.

Deadline: submit by 2026-11-20 23:59 IST. Target: 22:30 IST.

## 1. The brief (take-home, Gen AI & Engineering round)

1. **Build it.** A live web tool that collects 200+ real fresher job or internship posts in India from public sources (respecting each site's terms), removes duplicates, uses an LLM to tag each post by role and city, and shows them on a searchable page that refreshes every day on its own.
2. **Explain it.** A Loom of at most 5 minutes (face + screen) covering the architecture, what broke and how it was fixed. Share the repo.
3. **Put a number on it.** Hand-check 50 posts: how accurate the tagging is, and what it costs per 1,000 posts.

Submit: a link to the tool, the Loom, and a working doc or sheet with the data, the AI tools and the prompts used.

Next round: a 30-minute call where the founder asks for a live change to the code. "Use any AI tool you want. But the thinking has to be yours."

## 2. Users

- **Student:** a college student in India (tier 2/3 cities included), mostly on a phone, looking for a first job or internship they can actually apply to.
- **Admin:** the owner. Keeps the data clean (hides bad posts, fixes wrong tags, switches sources on and off) and watches the runs and the cost.
- **Reviewer:** opens the link, checks 5–10 cards, reads the numbers, skims the repo. Spends 5–20 minutes.

## 3. Must have

| ID | Requirement | How we check |
|---|---|---|
| M1 | A public URL serves the page without any login. | Open it signed out, on a phone. |
| M2 | At least 200 posts are shown, and every one meets §4. | The count on the page; spot-check 10. |
| M3 | Only public APIs whose terms allow this use. The page lists each one with its docs and terms links. | The sources table on the page. |
| M4 | Duplicates are removed, and the page says how many. | The number on the page. |
| M5 | The LLM tags every shown post with one role and its cities, and the model and prompt version are stored for each post. | Role and cities on every card; the tag cache. |
| M6 | Search, plus filters for role, city and job type. | Try them on a phone. |
| M7 | A scheduled GitHub Actions run refreshes the page every day with no human. The page shows the last refresh time and warns when the data is more than 30 hours old. The run history is in the Actions tab and the admin panel's Quality & runs tab (moved from the public page on 2026-11-20, `docs/DECISIONS.md`). | Actions history and the page. |
| M8 | Every card says "why it's here": the evidence phrase for company posts, the deciding fact for Adzuna posts. | Any card. |
| M9 | Funnel numbers per source: read → in India → candidates → tagged → eligible → after dedupe → shown. | "How it works" on the page. |
| M10 | Blind 50-post hand-check, scored by §9. The headline is "role and city both right"; role and city are also scored separately. Each figure has a 95% interval. Also reported: the share that really are fresher posts in India, per source. Every miss is listed. | `eval/report.md` |
| M11 | Cost per 1,000 posts, from the logged tokens of one full run, shown next to the provider console's spend. | `npm run cost` |
| M12 | One numbers file, `data/metrics.json` (run id, model, prompt version), feeds the page, the README and the sheet, each quoting "as of run X". | Compare all three. |
| M13 | The repo is public at submission. The README covers running it, the architecture, the numbers and the decisions. | The repo. |
| M14 | A sheet with these tabs: posts, hand-check 50, numbers, sources, AI tools and prompts, what broke. | The Google Sheet link. |
| M15 | A Loom of at most 5 minutes, camera on throughout. | The Loom link. |
| M16 | No secret in git or on the page. Before each push, the staged files are searched for every `.env` value. | The scan output. |
| M17 | **User panel** (owner's decision):<ul><li>sign up and sign in</li><li>a profile: graduation year, preferred roles, preferred cities</li><li>a "For you" list</li><li>saved jobs with an application status: saved, applied, interview, offer, rejected</li></ul> | Sign up as a new user and try every feature. |
| M18 | **Admin panel** (owner's decision):<ul><li>sign-in for admins only</li><li>a dashboard: runs, source health, LLM calls and cost, funnel, accuracy</li><li>a review queue: posts where the LLM's cities disagree with the location rule, and untagged posts</li><li>actions: hide a post, block a company, fix a post's role or cities, switch a board on or off</li><li>user counts only, never a list of users</li></ul> | Sign in as admin; a normal user is refused. |

**Release switch for M17 and M18.** If the panels do not work end to end by 21:30, their links are hidden (`panels: false` in `config/site.yaml`). The public page and M1–M16 never wait for the panels.

## 4. Which posts we show

A post is shown only if all of these are true:

1. **Genuine.** One real opening at a named employer. Not a talent pool, a general application, a walk-in drive, a post that asks for a fee, or an agency post for an unnamed client.
2. **In India**, or remote within India.
3. **Open to freshers.** At least one of:
   - it is an internship or an apprenticeship;
   - it states a minimum experience below 1 year (a range counts by its lower end, so "0–2 years" qualifies);
   - it explicitly invites freshers, students, recent graduates or a named batch.
4. **Recent.** Posted, or first seen, within the last 60 days.
5. **Not removed.** The admin has not hidden the post or blocked its company.

These are never shown:
- a post that asks for 1 year or more;
- a post that says nothing about experience and is not clearly entry-level ("unclear");
- commission-only, volunteer, campus-ambassador and freelance-gig posts.

Who decides what:
- **Rules** handle what is cheap and certain: India, senior titles, age.
- **The LLM** reports facts.
- **Code** makes the decision.
- **The admin** can override a decision. Overrides are logged and left out of the accuracy figures.

## 5. Tags

- **Role:** exactly one of the 17 roles in ARCHITECTURE §7. `other` is allowed.
- **Cities:** zero or more ids from the list of 56 Indian cities with aliases (Bangalore → bengaluru), plus two special ids:
  - `delhi_ncr`: NCR is named but no city in it;
  - `other_india`: an Indian town not on the list.

  The card shows the LLM's cities. When they disagree with the location rule, the post goes to the admin review queue, and the count of disagreements is reported.
- **Location status:** city listed, remote in India, pan-India or several places, or unknown.
- **Job type:** internship, apprenticeship, full_time, part_time, contract or other.
- **Stored but not scored:** the minimum years, whether freshers are invited, whether the post is genuine, and an evidence phrase of at most 15 words. The evidence phrase is not stored for Adzuna posts.

## 6. Should have (if time allows, in this order)

- **S1:** a "New today" badge, plus a posted or first-seen date on every card.
- **S2:** Google sign-in, alongside email and password.
- **S3:** a call kit for the live-change call (this can come after submission):
  - `npm run why -- <key>` prints the decision trail of one post;
  - `npm run eval:rerun -- --model <id>` re-tags the 50, re-scores them and prints the cost;
  - `npm run deploy:preview` puts a change on a preview URL.

## 7. Will not do now

- Email or WhatsApp alerts, resume features, more languages.
- A server of our own. Sign-in and panel data use Supabase; the page stays static.
- Scraping HTML pages. Naukri, Internshala, LinkedIn, Indeed, Foundit and Glassdoor forbid automated collection in their terms.
- A share link (cut after review).

## 8. Constraints

- **Time:** built tonight; the submission package is ready by 22:30 IST.
- **Money:** free tiers for hosting, the database and scheduling. Every LLM call (tagging and the Codex workers) runs on the owner's Azure OpenAI resource, paid from a startup credit until 29 Jan 2027. Azure emails the owner at Rs 25k, 40k and 50k of spend in a month. Tagging costs well under $5; Codex development is the main spend (about $15–20 for a heavy day on gpt-6.2-sol).
- **Code:** one language (TypeScript, plus plain JavaScript in the browser). About 3,500 lines including the panels and tests, so it can be read in a couple of hours and changed live.
- **Politeness:**
  - a User-Agent with a contact email;
  - at most 1 request per second per host;
  - a host that answers 429 or 403 is not called again in that run;
  - logs show the host and path only, never the query string (it holds the Adzuna key).
- **Privacy:**
  - the contact email is personal, not the employer's;
  - no secrets and no Adzuna post text in git;
  - no key files in the OneDrive folder: keys live in Windows user environment variables;
  - the admin sees user counts, never a list of users.

## 9. Numbers: what we report and the scoring rules

- **Measured run:** T8, a full run from an empty cache with the prompt frozen.
- **The draw:**
  - 50 posts shown in the measured run, seeded by the run id, at most 2 per company;
  - posts used to tune the prompt are excluded;
  - a dead link is replaced by the next post in the seeded order, and the replacement is listed.
- **Labels:**
  - made from the original post, following `eval/GUIDELINE.md`, which is committed before labelling starts;
  - no tags are visible while labelling;
  - the labels (keys and label ids only) are committed before `eval:score` runs, and it refuses to run otherwise.
- **Scoring:**
  - role is right when the id matches exactly;
  - cities are right when the sets match exactly after aliases are resolved (an empty set matches an empty set for remote, pan-India or unknown);
  - the headline is "both right";
  - every figure gets a Wilson 95% interval;
  - the fresher-in-India share is reported per source, and every miss gets a reason.
- **Cost:** from the measured run's call log, the sum of tokens × price, divided by the posts tagged, × 1,000. Also reported per 1,000 shown, with the console spend alongside.
- All numbers go to `data/metrics.json`, together with the run id, the model and the prompt version.

## 10. Decisions (owner: Avinash)

Before submitting, rewrite each reason in your own words. Log every later change in `docs/DECISIONS.md`.

| # | Decision | Chosen | Rejected | Reason (facts) |
|---|---|---|---|---|
| D1 | How to build | A lean v2, rebuilt from scratch | Running v1 | v1 is 13,600 lines and never ran live; it has to be explained and changed live. |
| D2 | Tagging model | `gpt-6-luna` on Azure OpenAI, reasoning effort low | Claude Haiku 5.5 (no Anthropic key); gpt-6.2-sol (20× the cost) | Same price class as Haiku ($0.10 / $0.50 per million tokens), paid from the Azure credit. The 120-post check before the freeze decides whether to move up to gpt-6.1-terra. |
| D3 | Hosting | Cloudflare Pages, direct upload | GitHub Pages (needs a public repo), Vercel | Works while the repo is private; daily deploys are free. |
| D4 | Panels | User and admin panels on Supabase (Auth + Postgres with row-level security) | No panels (Claude Code's first advice); our own server | Students need saved jobs and tracking, and the admin needs moderation. Supabase saves writing auth. |
| D5 | AI tools | Claude Code (Opus 5.5) leads; Codex CLI with Azure profiles: sol builds the page and panels, astra reviews, luna polishes text | One tool only | Parallel work, and a review from a different model family. |
| D6 | Repo folder | `myskill\zero-se-shuru`, inside OneDrive. `node_modules` and `.cache` are junctions to `C:\dev\zero-se-shuru-deps`. | `C:\dev\zero-se-shuru` (Claude Code's suggestion) | Everything stays in one place, and the junctions keep 20,000 package files and the Adzuna data off the cloud. |
| D7 | Schedule | 06:07 and 19:07 IST | Once a day | The evening run proves "on its own" before submission. |
| D8 | Keys | Windows user environment variables. GitHub Actions uses Azure Key 2. Key 1 is rotated after submission. | A `.env` file | No key file sits in OneDrive. The API file was moved out of OneDrive because it had already synced. |
