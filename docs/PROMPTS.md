# AI tools and prompts

The brief asks for the AI tools and the prompts used. This file has three parts.

## 1. My prompts (Avinash): where I steered or corrected the AI

_(Avinash: these are my prompts to Claude Code, word for word in Hinglish, oldest first, with an English gloss. Check the selection and edit it if you like.)_

| # | My prompt (verbatim) | In English | What it changed |
|---|---|---|---|
| 1 | "in dono ko achha se read karo samjho phir me bataunga kya krna h or tum batana tum kya samjhe" | Read both chat exports carefully and tell me what you understood before doing anything. | No code until the brief and the earlier plan were read back and agreed. |
| 2 | "full code extract kr diya hu full code read krke batao jitna resorce diya hu sab read krke batao" | Read the whole extracted v1 code and every resource first. | A full review of v1 (13,600 lines, never run live), which led to the lean v2 rebuild. |
| 3 | "requremnt, ssytem design artitacure task / sab tum new bna lo ... agar tumko lagta h scrach se kam krna h" | Write new requirements, architecture and tasks; start from scratch if that is better. | `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, a task list; old material archived. |
| 4 | "ye sab design kr liye hon ishka website admin panel user panel kuchh chhota nahi h na" | Isn't this too small without an admin panel and a user panel? | Reopened the scope question. |
| 5 | "USER - OR ADMIN DONO PANEL BNA LENA / IN SAB MODAL KI API DUNGA SAB SET KRKE KAM KR LENA" | Build both panels; I'll give you every model's API, set them up and use them. | Login-based user and admin panels (overruled the lean plan); a multi-model team. |
| 6 | "iSHKE SUNDER FOLDER BNA KR SAB RAKHNA H YEHI KAM KRNA H BAHAR NAHI" | Keep everything inside this folder; work here, not outside. | The repo lives in the project folder; packages are kept off OneDrive with junctions. |
| 7 | "supabase kyu use krna h jab apne pass 8 core, 32gb ram, 400gb nvme ka vps h" | Why Supabase when I have my own 8-core, 32 GB VPS? | A written trade-off; Supabase kept for tonight, the VPS kept for later (`docs/DECISIONS.md`). |
| 8 | "tum khud all work kr sakte ho ... tumko batao mere se kya chahiye" | Do all the work yourself; tell me only what you need from me. | Setup scripts for Supabase, Cloudflare and GitHub secrets; the asks shrank to account sign-ups. |
| 9 | "GPT BALE API USE KR RAHE HO YA NAHI DEVELOPMENT USHI SE KRWANA H" | Are you using the GPT APIs? Development should be done with them. | More of the coding went to gpt-6.2-sol: the labelling tool, the workbook builder, fixes. |
| 10 | "DEVELOPMENT CHAL RAHA H YA NHAI CHATGPT SE - ADMIN PANEL USER PANEL - OR DESIGN BHI ACHHA HONA CHAHIYE OR KAM KA SPEED BADHA DO" | Is GPT doing the development? The design must be good too, and speed things up. | A design pass from screenshots, a second independent review, and parallel workers. |

## 2. Tools

| Tool | Model | Used for |
|---|---|---|
| Claude Code | Claude Opus 5.5 | Lead: research, plan, pipeline code, integration, tests, deploy |
| `src/tools/gpt-worker.ts` (Azure OpenAI Responses API) | gpt-6.2-sol | Front-end: the page, the user panel and the admin panel |
| `src/tools/gpt-worker.ts` (Azure OpenAI Responses API) | gpt-6.2-astra | Independent code reviews |
| Azure OpenAI (in the product) | gpt-6-luna | Tagging each post: role, cities, fresher facts |

Codex CLI 0.171 was set up for the two GPT workers first, but on Windows it could not run any command (`docs/BUILD_LOG.md`), so `gpt-worker.ts` sends the same task straight to the Azure API and writes only the files it is allowed to.

## 3. Prompts sent to other models

### Tagging prompt (in the product)
`prompts/tag.md`, version `v1`. `config/model.yaml` names the file and the version.

### Design pass (gpt-6.2-sol, with screenshots), 2026-11-20 16:00 IST

`tasks/design.md`, sent with screenshots of the page on a laptop and a phone, so the model could see the design it was changing. It restyled the page and both panels (`style.css`, two intro lines, one card wrapper); 79 s, about $0.18. Checked with new screenshots and a diff of every JS change.

### Second review (gpt-6.2-astra) and fixes (gpt-6.2-sol), 2026-11-20 16:05 IST

`tasks/review-2.md` asked for an independent review of everything written after the first review (18 findings, about $0.64). `tasks/fixes-sol.md` gave three of the fixes to gpt-6.2-sol (29 s, about $0.08); Claude Code made the rest and reran the tests and the 14 live security checks.

### Labelling tool worker (gpt-6.2-sol), 2026-11-20 15:05 IST

The full prompt is `tasks/labeler.md`: a local-only form for the 50-post hand-check (`src/eval/label-server.ts`, `eval/labeler/`). It asked for a server bound to 127.0.0.1 with Host and Origin checks, atomic writes of the same CSV format, and no access to predictions, so the check stays blind. 62 s, about $0.13. Claude Code then type-checked it, read every line, and tested it against a throwaway CSV (valid save, bad role, bad Origin, bad Host, a request for the predictions file).

### Front-end worker (gpt-6.2-sol), 2026-11-20 13:45 IST

Written for Codex CLI, then sent through `gpt-worker.ts` with the contract and docs attached (`tasks/frontend.md`).

```
You are the front-end worker on this repo. Another engineer owns everything outside site/.

1. Read docs/FRONTEND_CONTRACT.md first: it is your contract. Then read docs/REQUIREMENTS.md (M1-M18, sections 4-6) and docs/ARCHITECTURE.md (sections 9 and 10).
2. Build every file the contract lists, under site/ only: index.html, me.html, admin.html, style.css, js/app.js, js/me.js, js/admin.js, js/supa.js, js/common.js, js/config.example.js.
3. Do not create, change or delete anything outside site/. Do not change site/data/ or site/samples/ (sample data is already in site/data/ for testing).
4. Plain HTML, CSS and ES modules. No framework, no bundler, no npm package in the browser. The only external script is https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm, imported only by js/supa.js.
5. Security: write data with textContent/createElement only (never innerHTML with data); links only when the URL starts with https://; add a CSP meta tag (scripts: self and cdn.jsdelivr.net; connect: self and https://*.supabase.co).
6. Phone first (360 px), tap targets >= 44 px, visible focus, light and dark themes. It must also look clean and modern on desktop: this page will be judged by a startup founder.
7. Every page must work when js/config.js is missing or Supabase is down: the public list still renders and the panel links are hidden.

When finished, reply with: the files you created, how you tested them, and anything in the contract you could not do.
```
