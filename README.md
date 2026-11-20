# Zero Se Shuru

Real fresher jobs and internships in India, collected every day from companies' own job boards and the Adzuna API, tagged by an LLM with a role and cities, and checked against a strict "open to freshers" rule.

**Live page:** https://zero-se-shuru.pages.dev · **Run history:** the Actions tab of this repo, and "Recent runs" on the page.

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

Every card says *why it's here*. The page shows the funnel, the sources with their terms, the accuracy and cost, and the last 14 runs.

## Numbers

These come from `data/metrics.json` (one file, used by the page, this README and the sheet). Details: `eval/report.md`.

_(Filled in after the hand-check: role and city both right, role, city, fresher share by source, and cost per 1,000 posts, as of run X.)_

## How the 50-post check was kept honest

- The labelling rules (`eval/GUIDELINE.md`) were committed before any label was made.
- The 50 were drawn at random, seeded by the run id, from the measured run. Posts used to tune the prompt were excluded.
- Labels were made from the original posts without seeing the tags.
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

_(Avinash: write your five key decisions here in your own words, including two where you overruled the AI.)_

## Limits

- Company boards give only about 12% fresher posts; most of the volume comes from Adzuna, which provides just a snippet of each post.
- City and role tags come from the LLM and can be wrong. The admin review queue lists the posts where the LLM's cities disagree with the location rule.
- A post that a company keeps listed for months is treated as open (up to 180 days).
