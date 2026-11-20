# Decisions

The decisions table is in `docs/REQUIREMENTS.md` §10 (D1–D8). This file logs every decision made after that, newest last. Each entry: date, the decision, the option rejected, why, and whether it overruled the AI.

_(Avinash: rewrite the "why" of each entry in your own words before submitting.)_

| Date | Decision | Rejected | Why | Overruled the AI? |
|---|---|---|---|---|
| 2026-11-20 | Build login-based user and admin panels | No panels, or a read-only status page | Students need saved jobs and tracking; the admin needs moderation | Yes. Claude Code advised a lean build without login |
| 2026-11-20 | Keep the repo inside the `myskill` folder | `C:\dev\zero-se-shuru` | One place for everything; the junctions keep the packages off the cloud | Yes. Claude Code suggested `C:\dev` |
| 2026-11-20 | Tag with gpt-6-luna on Azure OpenAI | Claude Haiku 5.5 | Same price class, paid from the existing Azure credit, no new account | Partly. Claude Code proposed Haiku first |
| 2026-11-20 | Use Claude Code plus Codex (GPT-6.x) together | One tool only | Parallel front-end work, and an independent reviewer | Yes. This was my idea |
