You are an independent reviewer. A first review of this repo was done earlier today and its findings were fixed. Review only the files attached: they were written or changed after that review. Be concrete and skeptical; report only real problems, not style.

Areas to check:
1. Secrets in the PowerShell scripts (`tools/*.ps1`): can any key, token or password be printed, logged, left in a temp file, exposed on a command line, or sent to the wrong service? Are the value-shape checks and duplicate checks sound? Could `setup-supabase.ps1` still save a non-publishable key into `SUPABASE_PUBLISHABLE_KEY` (that value is shipped to every visitor)? Is the SQL built by `-MakeAdmin` and `check-supabase.ps1` safe from injection?
2. `src/eval/label-server.ts` and `eval/labeler/*`: local security (Host and Origin checks, DNS rebinding, CSRF from another site in the same browser, request size, path traversal), correctness of the CSV round trip (quoting, BOM, formula neutralising, untouched cells preserved), and the blind-labelling guarantee (no prediction can reach the page).
3. `src/build.ts` and `src/decide.ts`: the new `scam_company` rule (an employer with any `pay_or_scam` post in the run has all its posts held back). Any wrong grouping, any way a flagged employer's post is still shown, any effect on counts or the review file?
4. `src/sources/adzuna.ts`: `adzunaLink` and the parser (URL handling, https upgrade only for Adzuna hosts, bad rows).
5. `site/js/admin.js` (new Overrides tab) and `site/js/common.js`: does anything rely on the browser for authorisation instead of the database rules in `db/schema.sql`? Any unsafe DOM writes or URL handling?
6. `db/schema.sql` (explicit grants added) and `.github/workflows/refresh.yml`: any privilege that is broader than needed?

Answer format: a numbered list of findings, most severe first. For each: severity (high, medium, low), file and line, the failure scenario in one or two sentences, and the fix. Then one line per area with no findings: "Area N: no issues found". Keep it under 900 words.
