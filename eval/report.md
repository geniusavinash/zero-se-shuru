# 50-post check (AI labels, not a hand check): run 2026-11-20T10-19-01Z-local

Model gpt-6-luna, prompt v1. Labels committed before scoring (see the git log of eval/labels_50.csv).

**Who labelled:** Claude Opus 5.5 (claude-opus-5-5), an AI model, not by hand.

**Text used:** Company-board posts (10): the full post text from the board's public API, the same text as the public post. Adzuna posts (40): the API snippet (up to 500 characters) with the title, company and location. adzuna.in refuses automated requests, so the full Adzuna pages were not read.

**Blind:** Labelled from a pack built from the raw collected posts, with no tags or predictions in it. eval/pred_50.json was not opened before this file and eval/labels_50.csv were committed.

**Limits:**
- Not a hand check: an AI model made every label.
- The same AI session wrote the tagging prompt and the guideline, so the labels are not independent of the design.
- For the 40 Adzuna posts the labeller saw only the snippet the tagger saw, so facts that appear only in the full post are not checked.

| Measure | Result |
|---|---|
| Role and city both right | 42/50 = 84% (95% CI 72–92%) |
| Role right | 45/50 = 90% (95% CI 79–96%) |
| City right | 45/50 = 90% (95% CI 79–96%) |
| Really a fresher post in India: greenhouse | 7/7 = 100% (95% CI 65–100%) |
| Really a fresher post in India: adzuna | 38/40 = 95% (95% CI 84–99%) |
| Really a fresher post in India: lever | 3/3 = 100% (95% CI 44–100%) |

Cost of the measured run: $0.2012 for 1713 posts tagged (1753 calls) → $0.1175 per 1,000 posts tagged, $0.6799 per 1,000 posts shown.

## Misses (8)

| Post | Source | Role (shown → label) | Cities (shown → label) |
|---|---|---|---|
| greenhouse:freshprints:6126731004 | greenhouse | ok | hyderabad → (none) |
| lever:rws:0df914c7-2848-4a05-be1d-96f52909886d | lever | data_analytics_ai → other | delhi → (none) |
| adzuna:6c8d89dbe4f1aa49 | adzuna | other → software_development | ghaziabad, noida → noida |
| adzuna:c8dd42a25b274e26 | adzuna | ok | (none) → gurugram |
| adzuna:4ab55bef2e646a0a | adzuna | other → legal_compliance | ok |
| adzuna:bd9d839d1a705609 | adzuna | operations_admin → finance_accounting | ok |
| adzuna:fc47eacbb028ab20 | adzuna | other → finance_accounting | ok |
| adzuna:e63b062c839a2d74 | adzuna | ok | goa, other_india → (none) |
