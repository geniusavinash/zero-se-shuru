You are a worker on this repo. Write one new file, `src/tools/make-sheet.ts`, that builds the submission spreadsheet as a single `.xlsx` workbook (the owner uploads it to Google Drive, which opens it as a Google Sheet with tabs). Return only that file.

## Input
- CSV files written by `src/export.ts` (attached) in `.cache/exports/`: `posts.csv`, `sources.csv`, `runs.csv` always; `handcheck_50.csv` and `numbers.csv` only after the hand-check (skip a tab whose CSV is missing, and print that it was skipped). Each CSV starts with a UTF-8 BOM and uses the quoting of `csvCell` (attached `src/eval/common.ts`); parse them with the exported `parseCsv` from `../eval/common.ts` after stripping the BOM. Note `csvCell` prefixes `'` to cells that start with `= + - @`; keep that prefix (it keeps formulas inert).
- `site/data/meta.json` for `runId`, `generatedAt` and `site.publicUrl`, `site.repoUrl`.
- `docs/PROMPTS.md`, `prompts/tag.md` and every `tasks/*.md` file, for the prompts tab.

## Output
`.cache/exports/zero-se-shuru-sheet.xlsx`, tabs in this order:
1. **About**: two columns (`item`, `value`): title "Zero Se Shuru: fresher jobs and internships in India", live page URL, repo URL, the measured run id (`eval/sample_50.json` has `runId`; fall back to meta.runId), generated time, and one row per tab saying what it holds.
2. **Posts** (posts.csv), 3. **Hand-check 50** (handcheck_50.csv), 4. **Numbers** (numbers.csv), 5. **Sources** (sources.csv), 6. **Runs** (runs.csv).
7. **AI tools**: the markdown table under "## 2. Tools" in docs/PROMPTS.md, parsed into columns (Tool, Model, Used for).
8. **Prompts**: columns `name`, `model`, `file`, `text`. One row for `prompts/tag.md` (model gpt-6-luna, the in-product tagging prompt) and one row per `tasks/*.md` file (model: the one named for it in docs/PROMPTS.md if you can match it by file name, else blank), `text` = the full file text (truncate to 32,000 characters with "… (truncated)" if longer).

## How (strict)
- Node built-ins only: `node:fs`, `node:path`, `node:zlib` (`deflateRawSync`, and `crc32` from `node:zlib`, available in Node 22.2+). No npm packages.
- Write a minimal valid Office Open XML package yourself: a ZIP (local file headers, central directory, end record; method 8 deflate) containing `[Content_Types].xml`, `_rels/.rels`, `docProps/app.xml`, `docProps/core.xml`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/styles.xml`, and `xl/worksheets/sheetN.xml`.
- Cells: inline strings (`t="inlineStr"`, `<is><t xml:space="preserve">…</t></is>`), XML-escaped, with characters that are invalid in XML 1.0 removed. A value that matches `^-?\d+(\.\d+)?$` and is not a key/id column (for example `key`, `run`, `link`, `n`) is written as a number.
- Header row bold (a style in styles.xml), first row frozen, an autoFilter over the used range, column widths from the longest value (min 8, max 60), and wrapped text for the Prompts `text` column and any cell longer than 60 characters.
- Sheet names: at most 31 characters, none of `[]:*?/\`.
- Print each tab name with its row count, and the output path.
- TypeScript, ES module, run with `npx tsx src/tools/make-sheet.ts`; it must pass `tsc --noEmit` with the repo's tsconfig (attached: strict, noUncheckedIndexedAccess, verbatimModuleSyntax, `.ts` import extensions).

In `notes`, list anything you could not do.
