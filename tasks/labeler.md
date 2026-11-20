You are a worker on this repo. Build one small, local-only tool: a labelling page for the 50-post blind hand-check. The owner will label 50 job posts tonight; the tool must make that fast and make typos impossible. Another engineer owns everything else and will run and test your files.

Read the attached files first: eval/GUIDELINE.md (the labelling rules), src/eval/common.ts (CSV helpers and paths), src/eval/sample.ts (how the CSV is written: header and BOM), src/eval/labels.ts (how the labels are checked later), src/config.ts (loadConfig and the taxonomy types), config/taxonomy.yaml, src/serve.ts (style reference), package.json and tsconfig.json.

## Files to create (only these four; nothing else)

1. `src/eval/label-server.ts`
2. `eval/labeler/index.html`
3. `eval/labeler/labeler.js`
4. `eval/labeler/labeler.css`

## 1. src/eval/label-server.ts

- TypeScript, ES module, run with `npx tsx src/eval/label-server.ts`. Use only Node built-ins (node:http, node:fs, node:path) and the repo's own modules (`loadConfig` from ../config.ts; `readCsv`, `csvCell`, `PRIVATE_LABELS` from ./common.ts). No new npm packages. It must pass `tsc --noEmit` with the repo's tsconfig (strict, noUncheckedIndexedAccess, verbatimModuleSyntax-style `import type` for types, `.ts` import extensions as in the other files).
- The CSV path is `process.env.LABEL_FILE ?? PRIVATE_LABELS`. If the file does not exist, print `No ${path}: run npm run eval:sample first.` and exit with code 1.
- Listen on 127.0.0.1 only, port `Number(process.env.LABEL_PORT ?? 8081)`. On start print `labeller on http://127.0.0.1:<port> (file: <path>)`.
- Security, because this writes a file on the owner's laptop:
  - Reject (403) any request whose Host header is not `127.0.0.1:<port>` or `localhost:<port>`.
  - For POST: require `Content-Type: application/json`; if an Origin header is present it must be `http://127.0.0.1:<port>` or `http://localhost:<port>` (else 403); body at most 10 KB (else 413).
  - Static files: serve only the three files in eval/labeler/ by exact name (`/` → index.html, `/labeler.js`, `/labeler.css`) with correct content types and `cache-control: no-store`. Everything else 404. No directory traversal is possible because there is no path joining from the URL.
  - Every response carries `x-content-type-options: nosniff`; the HTML also gets `content-security-policy: default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
- Blind labelling: the server must never read or send `eval/pred_50.json`, anything under `site/`, anything under `data/`, or any model tag. Only the CSV, the taxonomy and the guideline.
- `GET /api/state` returns JSON:
  - `rows`: one object per CSV row, in file order, with the CSV's columns as strings (`n, key, source, link, title, company, location_text, label_role, label_cities, label_fresher_india, label_note`) plus `spare: boolean` (true when `Number(n) > 50`).
  - `roles`: `[{ id, name }]` from `loadConfig().taxonomy.roles`.
  - `cities`: `[{ id, name, aliases }]` from `taxonomy.cities` followed by `taxonomy.special_cities`.
  - `guideline`: the text of `eval/GUIDELINE.md`.
  - Read the CSV fresh on every request (the owner may also edit it by hand).
- `POST /api/label` with JSON `{ key, label_role, label_cities, label_fresher_india, label_note }`:
  - `key` must match a row. `label_role` is '' or a role id. `label_cities` is an array of city ids, each a known id, no duplicates (store sorted, joined with `;`). `label_fresher_india` is '', 'yes', 'no' or 'unsure'. `label_note` is a string of at most 300 characters with no line breaks (trim it). Any failure → 400 with `{ error: "<plain message>" }`.
  - Update only the four label columns of that row; keep every other cell exactly as read. Keep the header and the column order exactly as in the file.
  - Write the whole file back as: a UTF-8 BOM (`﻿`), the header line, the rows, each line's cells passed through `csvCell` and joined with `,`, lines joined with `\n`, and a final `\n` (the same format sample.ts writes).
  - Write atomically: write `<path>.tmp` then `renameSync` over the file. If that fails (for example the file is open in Excel), return 409 `{ error: "Could not save: close the CSV in Excel and try again." }`.
  - Respond `{ ok: true, row }` with the updated row (same shape as in /api/state).
- Any unexpected error → 500 `{ error: "Server error" }` and log the message (never a stack with file contents).

## 2–4. The page (eval/labeler/)

- Plain HTML, CSS and one ES module (`labeler.js`). No framework, no external script, font or stylesheet (the CSP above allows only 'self'). Never use innerHTML/outerHTML/insertAdjacentHTML with data: build nodes with createElement and textContent.
- On load, fetch `/api/state` and render. Show a clear error if it fails.
- Layout (laptop screen first, still usable at 768 px wide):
  - Header: the title "Hand-check labelling" and a progress line, e.g. "37 of 50 labelled · 1 dead link · 1 spare needed". A main-sample row counts as labelled when it has a role and a fresher answer, or its note is `dead`. "Spares needed" = the number of rows marked dead (main or spare) minus the spares already labelled; when it is above 0, say "Label the next spare".
  - Left column: the list of the 50 main rows (`n`, a short title, a status mark: done / dead / to do), then a separate collapsed group "Spares (only to replace a dead link)" with the spare rows. Clicking a row opens it. The open row is highlighted.
  - Main column, for the open row: `n`, title (as a heading), company, location_text, source, and a large link "Open the original post" (`target="_blank"`, `rel="noopener noreferrer"`), rendered as a link only when the URL starts with `https://`; otherwise show the text and "(link is not https)".
  - The form:
    - Role: a `<select>` with an empty first option "Choose a role" and the 17 roles by name (value = id).
    - Cities: a text filter box and, below it, a scrollable list of checkboxes, one per city (name, plus the id in small text). The filter matches name, id and aliases, case-insensitive. Checked cities also appear above the list as small chips with a remove button. A button "No city (remote, pan-India or none given)" clears all. A one-line hint from the guideline: "NCR with no city named: Delhi NCR. An Indian town not on the list: Other India."
    - "Fresher and in India": three radio buttons, Yes / No / Unsure, and the one-line rule: "Yes only if: in India (or remote in India), open to freshers (internship, under 1 year, or freshers/students/batch invited), and one real opening."
    - Note: a single-line text input (max 300).
    - Buttons: "Save and next" (primary; also Ctrl+Enter anywhere in the form), "Save", "Mark dead link" (sets the note to `dead`, saves, and shows "Marked dead. Label the next spare."), "Previous", "Next".
  - A status line under the form (role="status") for "Saved", errors from the server, and validation messages. "Save" with nothing filled is allowed (it saves the empty values).
  - A collapsible `<details>` "Labelling rules" that shows the guideline text in a `<pre>` (white-space: pre-wrap), via textContent.
- When every one of the 50 main rows is done (dead rows replaced by labelled spares), show a banner: "All 50 done. Next: run npm run eval:labels in the terminal."
- Accessibility: every control has a visible label; visible focus outlines; tap targets at least 40 px; light and dark themes through `prefers-color-scheme`; no colour-only status (use a text mark as well).
- Keep the code small and readable: no more than about 350 lines of JS and 200 of CSS.

## Reply

Return the four files. In `notes`, list anything in this task you could not do and any assumption you made about the repo's helpers.
