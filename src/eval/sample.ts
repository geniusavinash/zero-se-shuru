/**
 * npm run eval:sample — draws the 50 from the measured run's page (site/data/jobs.json): seeded by the
 * run id, at most 2 per company, never a post used for prompt tuning. Writes:
 *   eval/sample_50.json   the keys in order, plus 10 spares for dead links (commit it)
 *   eval/pred_50.json     what the page shows for them: role and cities (commit it; do not open it)
 *   eval/private_labels.csv  the sheet to fill in, with links and titles, no tags (stays local)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { seeded } from '../random.ts';
import { fold, sha256 } from '../text.ts';
import type { Row } from '../types.ts';
import { csvCell, PREDICTIONS, PRIVATE_LABELS, SAMPLE } from './common.ts';

const jobs = JSON.parse(readFileSync('site/data/jobs.json', 'utf8')) as Row[];
const meta = JSON.parse(readFileSync('site/data/meta.json', 'utf8')) as {
  runId: string;
  trigger: string;
  model: string;
  promptVersion: string;
  counts: { shown: number };
};
if (existsSync(SAMPLE) && !process.argv.includes('--force')) {
  throw new Error(`${SAMPLE} exists: the first draw is final. Use --force only if no label has been made.`);
}
const tuning = new Set<string>(existsSync('eval/tuning_keys.json') ? (JSON.parse(readFileSync('eval/tuning_keys.json', 'utf8')) as string[]) : []);
const pool = jobs.filter((r) => ![r.key, ...r.memberKeys].some((k) => tuning.has(k)));
const rnd = seeded(Number.parseInt(sha256(meta.runId).slice(0, 8), 16));
const shuffled = pool
  .map((r) => ({ r, x: rnd() }))
  .sort((a, b) => a.x - b.x)
  .map((v) => v.r);
const perCompany = new Map<string, number>();
const picked: Row[] = [];
for (const r of shuffled) {
  const k = fold(r.company);
  if ((perCompany.get(k) ?? 0) >= 2) continue;
  perCompany.set(k, (perCompany.get(k) ?? 0) + 1);
  picked.push(r);
  if (picked.length >= 60) break;
}
const main = picked.slice(0, 50);
const spares = picked.slice(50);
// The measured run's own facts are frozen here, so a later refresh can never change the reported numbers.
writeFileSync(
  SAMPLE,
  `${JSON.stringify({ runId: meta.runId, shown: meta.counts.shown, model: meta.model, promptVersion: meta.promptVersion, poolSize: pool.length, excludedTuning: jobs.length - pool.length, keys: main.map((r) => r.key), spares: spares.map((r) => r.key) }, null, 1)}\n`,
);
writeFileSync(PREDICTIONS, `${JSON.stringify(Object.fromEntries(picked.map((r) => [r.key, { role: r.role, cities: [...r.cities].sort(), source: r.source }])), null, 1)}\n`);
const header = ['n', 'key', 'source', 'link', 'title', 'company', 'location_text', 'label_role', 'label_cities', 'label_fresher_india', 'label_note'];
const lines = [header.join(',')];
picked.forEach((r, i) => {
  lines.push([String(i + 1), r.key, r.source, r.url, r.title, r.company, r.locationText, '', '', '', i >= 50 ? 'SPARE: use only to replace a dead link' : ''].map(csvCell).join(','));
});
writeFileSync(PRIVATE_LABELS, `﻿${lines.join('\n')}\n`);
console.log(`drew 50 (+${spares.length} spares) from ${pool.length} posts (run ${meta.runId}); ${jobs.length - pool.length} tuning posts excluded`);
console.log(`next: commit ${SAMPLE} and ${PREDICTIONS}, then label ${PRIVATE_LABELS} following eval/GUIDELINE.md`);
