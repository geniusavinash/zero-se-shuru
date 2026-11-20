# Zero Se Shuru

Real fresher jobs and internships in India, collected every day from companies' own job boards and the Adzuna API, tagged by an LLM with a role and cities, and checked against a strict "open to freshers" rule.

**Live page:** https://zero-se-shuru.pages.dev · **Run history:** the Actions tab of this repo, and the admin panel's Quality & runs tab.

## What it does

1. **Collect.**
   - 175 company job boards: Greenhouse, Lever and Ashby, read through their documented public APIs.
   - The Adzuna India API, used with a key and its required label.
   - No scraping, and none of the sites whose terms forbid automated collection (Naukri, Internshala, LinkedIn, Indeed).
2. **Screen with free rules.** Keep India only, drop senior titles, drop junk, apply an age limit.
3. **Tag with an LLM.** gpt-6-luna on Azure OpenAI, one call per post, with a strict JSON schema. It reports role, cities, minimum experience, whether freshers are invited, job type and whether the post is genuine. Answers are cached, so unchanged posts are free on later runs.
4. **Decide in code.** A post is shown only if it is genuine, in India, and an internship or apprenticeship, or asks under 1 year, or explicitly invites freshers.
5. **Remove duplicates.** The same opening in several cities becomes one card. A company-board post beats its Adzuna copy.
6. **Publish.** GitHub Actions runs it at 06:07 and 19:07 IST, commits the run record, and deploys the static page to Cloudflare Pages.

Every card says *why it's here*. The public page is the product: search, filters, the cards, and when the list was last updated. The evidence (the funnel, the sources with their terms, the accuracy and cost, and the last 14 runs) is in the admin panel's **Quality & runs** tab, and its numbers are below and in the sheet.

## Numbers

These come from `data/metrics.json` (one file, used by the admin panel, this README and the sheet). Details and every miss: `eval/report.md`.

Measured run `2026-11-20T10-19-01Z-local`, gpt-6-luna, prompt v1. 50 posts drawn at random from the 296 shown.

| Measure | Result (95% interval) |
|---|---|
| Role and city both right | 42/50 = 84% (72–92%) |
| Role right | 45/50 = 90% (79–96%) |
| City right | 45/50 = 90% (79–96%) |
| Really a fresher post in India: Adzuna | 38/40 = 95% (84–99%) |
| Really a fresher post in India: company boards (Greenhouse, Lever) | 10/10 (Greenhouse 7/7, 65–100%; Lever 3/3, 44–100%) |
| Cost per 1,000 posts tagged | $0.12 ($0.2012 for 1,713 posts, 1,753 calls, from an empty cache) |
| Cost per 1,000 posts shown | $0.68 |
| Next scheduled run | 2 new calls, $0.0002: unchanged posts are not tagged again |

**Who labelled: an AI, not a hand check.** The 50 labels were made by Claude Opus 5.5, not by hand (`eval/labelling.json`). It is a different model family from the tagger, but the same AI session wrote the tagging prompt and the guideline. For the 10 company-board posts it read the full post text from the board's API. For the 40 Adzuna posts it read only the API snippet (up to 500 characters), the same text the tagger saw, because adzuna.in refuses automated requests. So these figures check how well the tagger read the text it was given, not facts that appear only in the full Adzuna page.

**What the misses show** (8 posts with 5 city errors and 5 role errors, all listed in `eval/report.md`):
- City: three are remote posts that also name a place ("Hyderabad, India (Remote)"). The tagger keeps the place; the guideline says remote means no city. This is the clearest thing to fix next, in code, without a new LLM call.
- City: one post had only "India" in its location and "Gurgaon" in the text; the guideline takes the city from the text, the tagger left it empty. One location read "Noida, Ghaziabad", where Ghaziabad is only the parent area in Adzuna's data; the tagger kept both.
- Role: a "NetSuite Technical Intern" was tagged other instead of software development. The other four are calls between two close roles: AR calling (finance or operations), a Deals internship (finance or other), oil and gas title work (legal or other), search-engine rating (data/AI or other). The labeller flagged two of these as ambiguous in its notes before scoring.

## How the 50-post check was kept honest

- The labelling rules (`eval/GUIDELINE.md`) were committed before any label was made.
- The 50 were drawn at random, seeded by the run id, from the measured run. Posts used to tune the prompt were excluded.
- Labels were made without seeing the tags: from a pack built from the raw collected posts, with no tags in it.
- The labels were committed before scoring. `npm run eval:score` refuses to run otherwise, so the git history shows the order.

## Run it

Needs Node 22 or newer. Keys are environment variables; `.env.example` lists them.

```
npm ci
npm test
npm run refresh -- --no-llm   # collect and count only
npm run refresh               # full run: builds site/data/
npm run serve                 # http://127.0.0.1:8080
```

## Architecture and decisions

- Requirements: `docs/REQUIREMENTS.md`.
- System design: `docs/ARCHITECTURE.md`.
- What broke and how it was fixed: `docs/BUILD_LOG.md`.
- Decisions: `docs/DECISIONS.md`.
- AI tools and prompts: `docs/PROMPTS.md`.

Key decisions I made (my own prompts, word for word, are in `docs/PROMPTS.md` part 1):

1. **A user panel and an admin panel, with login.** I overruled the AI here: Claude Code advised a lean build with no login. Students need to save and track jobs, and someone has to hide bad posts and fix tags without a code change.
2. **The coding split across models.** I overruled the AI again: Claude Code was writing everything itself. gpt-6.2-sol wrote the front end, the labelling form and the workbook builder; gpt-6.2-astra reviewed the code twice, independently; Claude Code led, integrated and tested every file.
3. **Supabase instead of my own VPS, for now.** I asked why not my 8-core, 32 GB VPS. I kept Supabase: login and row-level security come ready-made, and there is no server to keep alive while the page is being evaluated. The VPS stays an option for later.
4. **Everything in one project folder.** Claude Code suggested a folder outside it; I kept the repo in the project folder, and only the packages are kept off the synced drive, through junctions.
5. **The 50-post check labelled by an AI, and said so.** I asked Claude Code to finish the check itself. Every figure, in the admin panel, in this README and in the sheet, says the labels are AI labels, not a hand check.
6. **A production page, with the evidence behind the admin login.** I overruled the AI: its plan put the funnel, accuracy, cost and run history on the public page, as proof for reviewers. A student needs jobs, not test numbers, so the public page shows the jobs and when the list was last updated. The evidence moved to the admin panel's Quality & runs tab, and its numbers are in this README and the sheet.

## Limits

- Company boards give only about 12% fresher posts; most of the volume comes from Adzuna, which provides just a snippet of each post.
- City and role tags come from the LLM and can be wrong. The admin review queue lists the posts where the LLM's cities disagree with the location rule.
- A post that a company keeps listed for months is treated as open (up to 180 days).
