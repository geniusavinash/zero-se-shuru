# Decisions

The decisions table is in `docs/REQUIREMENTS.md` §10 (D1–D8). This file logs every decision made after that, newest last. Each entry: date, the decision, the option rejected, why, and whether it overruled the AI.

| Date | Decision | Rejected | Why | Overruled the AI? |
|---|---|---|---|---|
| 2026-11-20 | Build login-based user and admin panels | No panels, or a read-only status page | Students need saved jobs and tracking; the admin needs moderation | Yes. Claude Code advised a lean build without login |
| 2026-11-20 | Keep the repo inside the `myskill` folder | `C:\dev\zero-se-shuru` | One place for everything; the junctions keep the packages off the cloud | Yes. Claude Code suggested `C:\dev` |
| 2026-11-20 | Tag with gpt-6-luna on Azure OpenAI | Claude Haiku 5.5 | Same price class, paid from the existing Azure credit, no new account | Partly. Claude Code proposed Haiku first |
| 2026-11-20 | Use Claude Code plus Codex (GPT-6.x) together | One tool only | Parallel front-end work, and an independent reviewer | Yes. This was my idea |
| 2026-11-20 | Keep Supabase for login and data | Self-hosting on my own VPS (8 cores, 32 GB) | Nothing to keep alive while the page is being evaluated; login and row-level security come ready-made; the VPS stays an option for later | No. I questioned it; Claude Code recommended Supabase and I agreed |
| 2026-11-20 | Move more of the coding to the GPT models | Claude Code writing everything | Use the Azure credit and run work in parallel; Claude Code reviews and tests every file | Yes. My request |
| 2026-11-20 | A second design pass, from screenshots | Shipping the first design | The page is judged in seconds, often on a phone | Yes. My request |
| 2026-11-20 | Claude Code labels the 50-post check, and every figure says "AI labels, not by hand" | Labelling the 50 myself in the local form | I asked Claude Code to finish the work itself; saying who labelled keeps the numbers honest | Yes. Claude Code had planned a hand check by me |
