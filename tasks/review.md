You are a senior engineer doing an independent code review of a take-home project that will be judged tonight by a startup founder. Another model wrote the code. Find real problems, not style preferences.

The project: a daily pipeline that does five things.
1. Reads fresher job posts in India from company job boards (Greenhouse, Lever, Ashby) and the Adzuna API.
2. Screens them with rules.
3. Tags each post with an LLM (Azure OpenAI gpt-6-luna, strict JSON schema).
4. Decides eligibility in code, then removes duplicates.
5. Publishes a static page (Cloudflare Pages) with a public list, a user panel and an admin panel (Supabase Auth + Postgres with row-level security).

GitHub Actions runs it twice a day. The input contains the source files, the front end, the database schema, the workflow, the configs and the front-end contract.

Review for:
1. Correctness bugs: wrong logic, unhandled cases, data that would be dropped or shown wrongly, off-by-one, timezone mistakes.
2. Security: secrets leaking into git, logs or the page; XSS in the front end; row-level security holes in db/schema.sql (can a normal user write admin tables, read other users' rows, or escalate?); anything that lets an anonymous visitor change data.
3. Contract mismatches between what the pipeline writes (src/build.ts) and what the front end reads (site/js/*.js, docs/FRONTEND_CONTRACT.md).
4. Workflow problems: anything that would make the GitHub Actions run fail, deploy the wrong thing, or lose data.
5. Anything that would embarrass the candidate in front of the founder.

Output: a numbered list of findings, most important first, at most 15. For each give:
- severity (high, medium or low);
- the file and the function or line;
- what is wrong, in one or two sentences;
- the exact fix.

Leave out praise and generic advice. If something is fine, do not mention it.
