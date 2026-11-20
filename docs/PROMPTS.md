# AI tools and prompts

The brief asks for the AI tools and the prompts used. This file has three parts.

## 1. My prompts (Avinash): where I steered or corrected the AI

My prompts to Claude Code, word for word in Hinglish, oldest first, with an English gloss.

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
| 11 | "labeling ME NAHI SAMJHA / TUM APNA KAM 100% COMPLETE KRKE BATAO" | I didn't follow the labelling; finish the work yourself and report back. | Claude Code labelled the 50-post check, and every figure is marked "AI labels, not by hand" (`eval/labelling.json`). |
| 12 | "ye mujhe as ye production project ki trah dikhana h / Accuracy and cost / Recent runs / ye sab yek alga admin ke under tab bna kr - hm apne detail me ye sab dikha denge" | I want this to look like a production project. Put Accuracy and cost, Recent runs and the rest in a separate admin tab; we will show them in our own write-up. | The public page became the product (jobs, last updated, a footer); the evidence moved to the admin panel's "Quality & runs" tab (gpt-6.2-sol, `tasks/production.md`). |
| 13 | "dekho design hm kuchh yesha kr sabkte h ye sample banaya hu jo dekhne me bhi achha rahega / tum batao - fully responsive" (with a mockup image) | Look, we could do the design like this sample I made; it will look good. Tell me. Fully responsive. | A redesign in the mockup's style (gpt-6.2-sol, `tasks/redesign.md`), keeping only true content: real numbers instead of the mockup's sample figures, no salaries, logos, photo or support claims; a privacy page; checked from 360 px to 1440 px. |

## 2. Tools

| Tool | Model | Used for |
|---|---|---|
| Claude Code | Claude Opus 5.5 | Lead: research, plan, pipeline code, integration, tests, deploy; the labels for the 50-post check |
| `src/tools/gpt-worker.ts` (Azure OpenAI Responses API) | gpt-6.2-sol | Front-end: the page, the user panel and the admin panel |
| `src/tools/gpt-worker.ts` (Azure OpenAI Responses API) | gpt-6.2-astra | Independent code reviews |
| Azure OpenAI (in the product) | gpt-6-luna | Tagging each post: role, cities, fresher facts |

Codex CLI 0.171 was set up for the two GPT workers first, but on Windows it could not run any command (`docs/BUILD_LOG.md`), so `gpt-worker.ts` sends the same task straight to the Azure API and writes only the files it is allowed to.

## 3. Prompts sent to other models

### Tagging prompt (in the product)
`prompts/tag.md`, version `v1`. `config/model.yaml` names the file and the version.

### Redesign from the owner's mockup (gpt-6.2-sol, with images), 2026-11-20 17:40 IST

`tasks/redesign.md`, sent with the owner's mockup and screenshots of the current page on a laptop and a phone. Its first rule: the mockup is a style reference, not content, so every number is computed from the data and none of the mockup's sample claims (job counts, ratings, salaries, logos, "24/7 support", "Easy Apply") appear. It rebuilt the public page (hero search, popular searches from the data, "Just added", value strip, restyled cards with a monogram, "How it works" with an account card, a numbers strip, a dark footer), restyled the panels' header and footer, and added `privacy.html`, whose text was written by Claude Code from the actual schema and setup. 163 s, about $0.34. Claude Code reviewed the diff, made the popular-search chips compact, fixed the account button's text for a signed-in student, and checked 360, 390, 768, 1024, 1280 and 1440 px, dark mode, the menu, search, chips, saving and both panels in a real browser.

### Production pass (gpt-6.2-sol), 2026-11-20 17:00 IST

`tasks/production.md`, sent with the updated `docs/FRONTEND_CONTRACT.md` and the site files. The public page lost the evidence section and gained three figures for job seekers (openings, companies hiring, updated), a footer ("How we pick jobs", the Adzuna attribution, the removal contact, a small Admin link), a meta description, Open Graph tags and a favicon; the admin panel gained the "Quality & runs" tab, and its dashboard tiles open that tab at the right section. 97 s, about $0.26. Claude Code read every changed line, added a null check, removed a repeated sentence, redrew the favicon to match the header logo, and checked the page (1280 px and 390 px) and the signed-in admin panel in a real browser.

### The 50-post check labels (Claude Opus 5.5), 2026-11-20 16:40 IST

No prompt was sent to another model. Claude Code built a label pack from the raw collected posts (title, company, location, employment type and the post text; no tags, no predictions), read all 50 posts, and labelled each by `eval/GUIDELINE.md`, with a one-line note where a call was close. The labels went through the labelling form's API, so the form's checks applied. `eval/labelling.json` and `eval/report.md` say who labelled, what text was used and the limits.

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
