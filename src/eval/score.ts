/**
 * npm run eval:score — scores the committed labels against the committed predictions, works out the cost
 * of the measured run from data/llm_calls.jsonl, and writes eval/report.md and data/metrics.json (the one
 * numbers file the page, the README and the sheet read). Refuses unless eval/labels_50.csv is committed
 * and unchanged, which is the proof that the labels came before the score.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../config.ts';
import { cityIds, LABELS, PREDICTIONS, readCsv, SAMPLE, wilson } from './common.ts';

/** Who made the labels and from what text; shown with every figure, so an AI check is never passed off as a hand check. */
const LABELLING = process.env.LABELLING_IN ?? 'eval/labelling.json';
/** The labels to score (default eval/labels_50.csv); a second labeller's file can be scored instead. */
const LABELS_IN = process.env.LABELS_IN ?? LABELS;
type Labelling = { labeller: string; byHand: boolean; ownerReviewed: number; textUsed: string; blind: string; limits: string[] };

const cfg = loadConfig();
const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' }).trim();
if (!process.argv.includes('--no-git-check')) {
  if (git('log', '--oneline', '--', LABELS_IN) === '') throw new Error(`${LABELS_IN} is not committed yet. Commit it first: that commit is the proof the labels came before the score.`);
  if (git('status', '--porcelain', '--', LABELS_IN) !== '') throw new Error(`${LABELS_IN} has changes that are not committed.`);
  if (existsSync(LABELLING) && git('status', '--porcelain', '--', LABELLING) !== '') throw new Error(`${LABELLING} has changes that are not committed.`);
}
const sample = JSON.parse(readFileSync(SAMPLE, 'utf8')) as { runId: string; shown: number; model: string; promptVersion: string };
const pred = JSON.parse(readFileSync(PREDICTIONS, 'utf8')) as Record<string, { role: string; cities: string[]; source: string }>;
const labels = readCsv(LABELS_IN);
const labelling = existsSync(LABELLING) ? (JSON.parse(readFileSync(LABELLING, 'utf8')) as Labelling) : null;

const C = (correct: number, total: number) => ({ correct, total, ...wilson(correct, total) });
let role = 0;
let city = 0;
let both = 0;
const fresherBy: Record<string, { yes: number; total: number }> = {};
const misses: string[] = [];
for (const l of labels) {
  const p = pred[l.key ?? ''];
  if (!p) throw new Error(`no prediction for ${l.key}`);
  const labelCities = cityIds((l.label_cities ?? '').replaceAll(';', ';'), cfg.taxonomy);
  const predCities = [...p.cities].filter((c) => c !== '').sort();
  const roleOk = l.label_role === p.role;
  const cityOk = labelCities.length === predCities.length && labelCities.every((c, i) => c === predCities[i]);
  if (roleOk) role++;
  if (cityOk) city++;
  if (roleOk && cityOk) both++;
  const f = (fresherBy[p.source] ??= { yes: 0, total: 0 });
  f.total++;
  if (l.label_fresher_india === 'yes') f.yes++;
  if (!roleOk || !cityOk) {
    misses.push(`| ${l.key} | ${p.source} | ${roleOk ? 'ok' : `${p.role} → ${l.label_role}`} | ${cityOk ? 'ok' : `${predCities.join(', ') || '(none)'} → ${labelCities.join(', ') || '(none)'}`} |`);
  }
}
const n = labels.length;

// A second set of labels (for example the AI labels, when the main set is the owner's own), scored the
// same way, and how often the two labellers agree with each other.
const BASELINE = process.env.BASELINE_LABELS;
const sameSet = (x: string[], y: string[]): boolean => x.length === y.length && x.every((c, i) => c === y[i]);
type Interval = ReturnType<typeof C>;
let baseline: null | { labeller: string; file: string; accuracy: Record<'both' | 'role' | 'city', Interval>; agreement: Record<'role' | 'city', Interval> } = null;
if (BASELINE) {
  const base = new Map(readCsv(BASELINE).map((r) => [r.key ?? '', r]));
  let bRole = 0;
  let bCity = 0;
  let bBoth = 0;
  let aRole = 0;
  let aCity = 0;
  let m = 0;
  for (const l of labels) {
    const b = base.get(l.key ?? '');
    const p = pred[l.key ?? ''];
    if (!b || !p) continue;
    m++;
    const bc = cityIds(b.label_cities ?? '', cfg.taxonomy);
    const lc = cityIds(l.label_cities ?? '', cfg.taxonomy);
    const pc = [...p.cities].filter((c) => c !== '').sort();
    const roleOk = b.label_role === p.role;
    const cityOk = sameSet(bc, pc);
    if (roleOk) bRole++;
    if (cityOk) bCity++;
    if (roleOk && cityOk) bBoth++;
    if (b.label_role === l.label_role) aRole++;
    if (sameSet(bc, lc)) aCity++;
  }
  baseline = {
    labeller: process.env.BASELINE_LABELLER ?? 'the other labeller',
    file: BASELINE,
    accuracy: { both: C(bBoth, m), role: C(bRole, m), city: C(bCity, m) },
    agreement: { role: C(aRole, m), city: C(aCity, m) },
  };
}

// Cost of the measured run, from the call log.
const calls = existsSync('data/llm_calls.jsonl')
  ? readFileSync('data/llm_calls.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { run: string; post: string; costUsd: number; input: number; cachedInput: number; output: number })
  : [];
const runCalls = calls.filter((c) => c.run === sample.runId);
const cost = runCalls.reduce((a, c) => a + c.costUsd, 0);
const posts = new Set(runCalls.map((c) => c.post)).size;
const shownInRun = sample.shown;

const metrics = {
  asOfRun: sample.runId,
  model: sample.model,
  promptVersion: sample.promptVersion,
  labelledAt: new Date().toISOString(),
  labelling,
  baseline,
  accuracy: { both: C(both, n), role: C(role, n), city: C(city, n) },
  fresherShareBySource: Object.fromEntries(Object.entries(fresherBy).map(([s, v]) => [s, C(v.yes, v.total)])),
  llmCallsInRun: runCalls.length,
  postsTaggedInRun: posts,
  costUsdRun: Number(cost.toFixed(4)),
  costPer1000Tagged: posts > 0 ? Number(((cost / posts) * 1000).toFixed(4)) : null,
  costPer1000Shown: shownInRun ? Number(((cost / shownInRun) * 1000).toFixed(4)) : null,
};
writeFileSync('data/metrics.json', `${JSON.stringify(metrics, null, 1)}\n`);

const pct = (x: { correct: number; total: number; low: number; high: number }): string =>
  `${x.correct}/${x.total} = ${Math.round((x.correct / x.total) * 100)}% (95% CI ${Math.round(x.low * 100)}–${Math.round(x.high * 100)}%)`;
const report = [
  `# ${labelling && !labelling.byHand ? '50-post check (AI labels, not a hand check)' : 'Hand-check of 50 posts'}: run ${sample.runId}`,
  '',
  `Model ${sample.model}, prompt ${sample.promptVersion}. Labels committed before scoring (see the git log of ${LABELS}).`,
  '',
  ...(labelling
    ? [
        `**Who labelled:** ${labelling.labeller}${labelling.byHand ? '' : ', not by hand'}${labelling.ownerReviewed > 0 ? `; the owner reviewed ${labelling.ownerReviewed} of the 50 against the original posts` : ''}.`,
        '',
        `**Text used:** ${labelling.textUsed}`,
        '',
        `**Blind:** ${labelling.blind}`,
        '',
        '**Limits:**',
        ...labelling.limits.map((l) => `- ${l}`),
        '',
      ]
    : []),
  '| Measure | Result |',
  '|---|---|',
  `| Role and city both right | ${pct(metrics.accuracy.both)} |`,
  `| Role right | ${pct(metrics.accuracy.role)} |`,
  `| City right | ${pct(metrics.accuracy.city)} |`,
  ...Object.entries(metrics.fresherShareBySource).map(([s, v]) => `| Really a fresher post in India: ${s} | ${pct(v)} |`),
  '',
  `Cost of the measured run: $${metrics.costUsdRun} for ${posts} posts tagged (${runCalls.length} calls) → $${metrics.costPer1000Tagged} per 1,000 posts tagged${metrics.costPer1000Shown ? `, $${metrics.costPer1000Shown} per 1,000 posts shown` : ''}.`,
  '',
  ...(baseline
    ? [
        `## Second labeller: ${baseline.labeller} (${baseline.file})`,
        '',
        `Scored the same way: role and city both right ${pct(baseline.accuracy.both)}; role ${pct(baseline.accuracy.role)}; city ${pct(baseline.accuracy.city)}.`,
        '',
        `The two labellers agree on the role for ${pct(baseline.agreement.role)} of the posts, and on the cities for ${pct(baseline.agreement.city)}.`,
        '',
      ]
    : []),
  `## Misses (${misses.length})`,
  '',
  '| Post | Source | Role (shown → label) | Cities (shown → label) |',
  '|---|---|---|---|',
  ...misses,
  '',
].join('\n');
writeFileSync('eval/report.md', report);
console.log(report);
