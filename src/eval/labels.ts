/**
 * npm run eval:labels — checks the filled sheet and writes eval/labels_50.csv: keys and labels only
 * (no titles or links), ready to commit. Commit it before `npm run eval:score`.
 * A row marked "dead" in label_note is replaced by the next spare, in order.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../config.ts';
import { cityIds, csvCell, LABELS, PRIVATE_LABELS, readCsv, SAMPLE } from './common.ts';

// LABEL_FILE and LABELS_OUT let a second labeller (the owner, by hand) use their own sheet and output,
// next to the first set (AI labels), without overwriting it.
const INPUT = process.env.LABEL_FILE ?? PRIVATE_LABELS;
const OUTPUT = process.env.LABELS_OUT ?? LABELS;
const cfg = loadConfig();
const roles = new Set(cfg.taxonomy.roles.map((r) => r.id));
const sample = JSON.parse(readFileSync(SAMPLE, 'utf8')) as { keys: string[]; spares: string[] };
const rows = new Map(readCsv(INPUT).map((r) => [r.key ?? '', r]));
const problems: string[] = [];
const final: { key: string; role: string; cities: string; fresher: string; replaced?: string }[] = [];
const spares = [...sample.spares];

for (const key of sample.keys) {
  let k = key;
  let replaced: string | undefined;
  let r = rows.get(k);
  while (r && /\bdead\b/i.test(r.label_note ?? '')) {
    const next = spares.shift();
    if (!next) {
      problems.push(`${key}: dead link and no spare left`);
      break;
    }
    replaced = replaced ?? k;
    k = next;
    r = rows.get(k);
  }
  if (!r) {
    problems.push(`${k}: row missing from ${INPUT}`);
    continue;
  }
  const role = (r.label_role ?? '').trim();
  const fresher = (r.label_fresher_india ?? '').trim().toLowerCase();
  if (!roles.has(role)) problems.push(`${k}: label_role "${role}" is not a role id`);
  if (!['yes', 'no', 'unsure'].includes(fresher)) problems.push(`${k}: label_fresher_india must be yes, no or unsure`);
  final.push({ key: k, role, cities: cityIds(r.label_cities ?? '', cfg.taxonomy).join(';'), fresher, replaced });
}
if (problems.length > 0) {
  console.log(`${problems.length} problems; nothing written:`);
  for (const p of problems.slice(0, 20)) console.log(`  ${p}`);
  process.exitCode = 1;
} else {
  const out = ['key,label_role,label_cities,label_fresher_india,replaced_dead_link', ...final.map((f) => [f.key, f.role, f.cities, f.fresher, f.replaced ?? ''].map(csvCell).join(','))];
  writeFileSync(OUTPUT, `${out.join('\n')}\n`);
  console.log(`wrote ${OUTPUT} (${final.length} rows${final.some((f) => f.replaced) ? `, ${final.filter((f) => f.replaced).length} dead links replaced` : ''}). Commit it, then run npm run eval:score.`);
}
