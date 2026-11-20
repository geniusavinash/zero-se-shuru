# AI tools and prompts

The brief asks for the AI tools and the prompts used. This file has three parts.

## 1. My prompts (Avinash): where I steered or corrected the AI

_(Write 8–10 of your own prompts here, in your words, oldest first. Pick the ones where you changed the AI's direction. Examples from tonight: asking for a full review of v1 before building; insisting on user and admin panels after Claude Code advised against them; choosing to keep the work inside the project folder; moving the tagger to Azure gpt-6-luna.)_

## 2. Tools

| Tool | Model | Used for |
|---|---|---|
| Claude Code | Claude Opus 5.5 | Lead: research, plan, pipeline code, integration, tests, deploy |
| Codex CLI 0.171 (Azure OpenAI) | gpt-6.2-sol | Front-end: the page, the user panel and the admin panel |
| Codex CLI 0.171 (Azure OpenAI) | gpt-6.2-astra | Independent code reviews |
| Azure OpenAI (in the product) | gpt-6-luna | Tagging each post: role, cities, fresher facts |

## 3. Prompts sent to other models

### Tagging prompt (in the product)
`prompts/tag.md`, version `v1`. `config/model.yaml` names the file and the version.

### Codex front-end worker (gpt-6.2-sol), 2026-11-20 13:45 IST

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
