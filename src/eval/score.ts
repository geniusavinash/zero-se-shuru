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

const cfg = loadConfig();
const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' }).trim();
if (!process.argv.includes('--no-git-check')) {
  if (git('log', '--oneline', '--', LABELS) === '') throw new Error(`${LABELS} is not committed yet. Commit it first: that commit is the proof the labels came before the score.`);
  if (git('status', '--porcelain', '--', LABELS) !== '') throw new Error(`${LABELS} has changes that are not committed.`);
}
const sample = JSON.parse(readFileSync(SAMPLE, 'utf8')) as { runId: string; shown: number; model: string; promptVersion: string };
const pred = JSON.parse(readFileSync(PREDICTIONS, 'utf8')) as Record<string, { role: string; cities: string[]; source: string }>;
const labels = readCsv(LABELS);

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
  `# Hand-check of 50 posts: run ${sample.runId}`,
  '',
  `Model ${sample.model}, prompt ${sample.promptVersion}. Labels from the original posts, committed before scoring (see the git log of ${LABELS}).`,
  '',
  '| Measure | Result |',
  '|---|---|',
  `| Role and city both right | ${pct(metrics.accuracy.both)} |`,
  `| Role right | ${pct(metrics.accuracy.role)} |`,
  `| City right | ${pct(metrics.accuracy.city)} |`,
  ...Object.entries(metrics.fresherShareBySource).map(([s, v]) => `| Really a fresher post in India: ${s} | ${pct(v)} |`),
  '',
  `Cost of the measured run: $${metrics.costUsdRun} for ${posts} posts tagged (${runCalls.length} calls) → $${metrics.costPer1000Tagged} per 1,000 posts tagged${metrics.costPer1000Shown ? `, $${metrics.costPer1000Shown} per 1,000 posts shown` : ''}.`,
  '',
  `## Misses (${misses.length})`,
  '',
  '| Post | Source | Role (shown → label) | Cities (shown → label) |',
  '|---|---|---|---|',
  ...misses,
  '',
].join('\n');
writeFileSync('eval/report.md', report);
console.log(report);
