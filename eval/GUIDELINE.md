# Labelling guideline for the 50-post hand-check

Written before any label was made. Committed to git before labelling, so the rules cannot drift to fit the results.

## How to label

1. Open `eval/private_labels.csv` (it stays on this laptop; git ignores it).
2. For each row, open the link and read the original post. Do not open the Zero Se Shuru page or `eval/pred_50.json` while labelling.
3. Fill in four columns:
   - `label_role`
   - `label_cities`
   - `label_fresher_india` (yes, no or unsure)
   - `label_note` (optional)
   The same sheet can be filled in a form: `npm run eval:label`, then open http://127.0.0.1:8081. It shows the post's title, company, location and link, the role and city lists, and these rules; it never shows a prediction. It writes the same CSV.
4. When all 50 are done, run `npm run eval:labels`. It writes `eval/labels_50.csv` (keys and labels only). Commit that file before scoring; `npm run eval:score` refuses to run otherwise.

## Role: exactly one id

software_development, data_analytics_ai, qa_testing, it_cloud_security, non_software_engineering, design_creative, product_project, marketing, content_writing, sales_bd, customer_support, operations_admin, finance_accounting, hr_recruitment, education_research, legal_compliance, other.

The definitions and tie-breaks are the ones in `config/taxonomy.yaml`:
- Judge by the work, not by the employer's industry.
- Business Analyst is data_analytics_ai, unless the work is requirements and coordination (then product_project).
- Targets and leads are sales_bd; campaigns and SEO are marketing.
- Customer-facing technical support is customer_support; internal IT is it_cloud_security.

## Cities: the set of city ids where the job is

- Ids from `config/taxonomy.yaml`, separated by `;`. Names and aliases are fine too (Bangalore, Gurgaon); they are mapped to ids.
- Remote, pan-India, or no place given: leave it empty.
- NCR with no city named: `delhi_ncr`.
- An Indian town that is not on the list: `other_india`.
- Use the location the post gives. Use a city from the description only when the location gives none.

## Fresher and in India (yes/no)

Answer yes only if all three hold:
- **India:** the job is in India, or remote within India.
- **Freshers:** an internship or apprenticeship; or a minimum experience under 1 year (a range counts by its lower end); or freshers, students, recent graduates or a named batch are explicitly invited.
- **Genuine:** one real opening at a named employer.

## Scoring (fixed now)

- **Role** is right when the id matches exactly.
- **City** is right when the sets match exactly after aliases. An empty set matches an empty set.
- **Headline:** role and city both right.
- Every figure is reported as correct/50 with a Wilson 95% interval. Fresher-and-India is reported per source.
- **Dead links:** if a link is dead, write `dead` in `label_note`. That post is replaced by the next post in the seeded draw, and the replacement is listed in the report.
