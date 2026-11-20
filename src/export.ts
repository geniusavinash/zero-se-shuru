/**
 * npm run export — CSVs for the Google Sheet (one file per tab), written to .cache/exports/:
 * posts, hand-check 50, numbers, sources, runs. Adzuna rows carry the "Jobs by Adzuna" attribution.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { csvCell, LABELS, PREDICTIONS, PRIVATE_LABELS, readCsv } from './eval/common.ts';
import type { Row } from './types.ts';

const out = '.cache/exports';
mkdirSync(out, { recursive: true });
const write = (name: string, header: string[], rows: (string | number | undefined)[][]): void => {
  const lines = [header.join(','), ...rows.map((r) => r.map((v) => csvCell(String(v ?? ''))).join(','))];
  writeFileSync(`${out}/${name}.csv`, `﻿${lines.join('\n')}\n`);
  console.log(`wrote ${out}/${name}.csv (${rows.length} rows)`);
};

const jobs = JSON.parse(readFileSync('site/data/jobs.json', 'utf8')) as Row[];
const meta = JSON.parse(readFileSync('site/data/meta.json', 'utf8')) as {
  runId: string;
  sources: { name: string; display: string; docs: string; terms: string; whyAllowed: string; attribution: string; boardsOk: number; boardsFailed: number }[];
  funnel: { total: Record<string, number>; bySource: Record<string, Record<string, number>> };
  runs: { id: string; startedAt: string; trigger: string; ok: boolean; shown: number; llmCalls: number; costUsd: number; blockedReason?: string }[];
};

write('posts', ['title', 'company', 'role', 'cities', 'job_type', 'posted', 'first_seen', 'source', 'why_its_here', 'link', 'attribution'], jobs.map((r) => [
  r.title, r.company, r.role, r.cities.join('; '), r.jobType, r.postedAt?.slice(0, 10), r.firstSeen, r.source, r.why, r.url, r.aggregator ? 'Jobs by Adzuna' : '',
]));

if (existsSync(LABELS) && existsSync(PREDICTIONS)) {
  const pred = JSON.parse(readFileSync(PREDICTIONS, 'utf8')) as Record<string, { role: string; cities: string[]; source: string }>;
  const byKey = new Map(jobs.map((r) => [r.key, r]));
  // A sampled post that is no longer listed today keeps its title and link from the local labelling sheet.
  const sheetRows = existsSync(PRIVATE_LABELS) ? new Map(readCsv(PRIVATE_LABELS).map((r) => [r.key ?? '', r])) : new Map<string, Record<string, string>>();
  write('handcheck_50', ['key', 'source', 'title', 'link', 'shown_role', 'label_role', 'role_ok', 'shown_cities', 'label_cities', 'cities_ok', 'fresher_in_india'], readCsv(LABELS).map((l) => {
    const p = pred[l.key ?? ''];
    const r = byKey.get(l.key ?? '');
    const shownCities = [...(p?.cities ?? [])].sort().join('; ');
    const labelCities = (l.label_cities ?? '').split(';').filter(Boolean).sort().join('; ');
    return [l.key, p?.source, r?.title ?? sheetRows.get(l.key ?? '')?.title, r?.url ?? sheetRows.get(l.key ?? '')?.link, p?.role, l.label_role, p?.role === l.label_role ? 'yes' : 'no', shownCities, labelCities, shownCities === labelCities ? 'yes' : 'no', l.label_fresher_india];
  }));
}

if (existsSync('data/metrics.json')) {
  const m = JSON.parse(readFileSync('data/metrics.json', 'utf8')) as Record<string, unknown> & {
    accuracy: Record<string, { correct: number; total: number; low: number; high: number }>;
    fresherShareBySource: Record<string, { correct: number; total: number; low: number; high: number }>;
    labelling?: { labeller: string; byHand: boolean; ownerReviewed: number; textUsed: string; limits: string[] } | null;
  };
  const rows: (string | number)[][] = [];
  if (m.labelling) {
    const l = m.labelling;
    rows.push(['labelled by', `${l.labeller}${l.byHand ? '' : ', not by hand'}${l.ownerReviewed > 0 ? `; owner reviewed ${l.ownerReviewed} of 50` : ''}`, '']);
    rows.push(['labelled by: text used', l.textUsed, '']);
    for (const limit of l.limits) rows.push(['labelled by: limit', limit, '']);
  }
  for (const [k, v] of Object.entries(m.accuracy)) rows.push([`accuracy: ${k}`, `${v.correct}/${v.total}`, `${Math.round(v.low * 100)}–${Math.round(v.high * 100)}%`]);
  for (const [k, v] of Object.entries(m.fresherShareBySource)) rows.push([`fresher in India: ${k}`, `${v.correct}/${v.total}`, `${Math.round(v.low * 100)}–${Math.round(v.high * 100)}%`]);
  for (const k of ['asOfRun', 'model', 'promptVersion', 'llmCallsInRun', 'postsTaggedInRun', 'costUsdRun', 'costPer1000Tagged', 'costPer1000Shown']) rows.push([k, String(m[k] ?? ''), '']);
  rows.push(['provider console spend (fill in by hand)', '', '']);
  write('numbers', ['measure', 'value', '95% interval'], rows);
}

write('sources', ['source', 'docs', 'terms', 'why_allowed', 'attribution', 'boards_ok', 'boards_failed', 'read', 'in_india', 'candidates', 'tagged', 'eligible', 'shown'], meta.sources.map((s) => {
  const f = meta.funnel.bySource[s.name] ?? {};
  return [s.display, s.docs, s.terms, s.whyAllowed, s.attribution, s.boardsOk, s.boardsFailed, f.read, f.india, f.candidates, f.tagged, f.eligible, f.shown];
}));

// Every run, including the scheduled ones on GitHub Actions: data/runs.json is the committed history
// (the page's meta.json only knows the runs up to the build it came from).
const runs = existsSync('data/runs.json') ? (JSON.parse(readFileSync('data/runs.json', 'utf8')) as typeof meta.runs) : meta.runs;
write('runs', ['run', 'started_utc', 'trigger', 'ok', 'shown', 'llm_calls', 'cost_usd', 'blocked_reason'], runs.map((r) => [r.id, r.startedAt, r.trigger, r.ok ? 'yes' : 'no', r.shown, r.llmCalls, r.costUsd, r.blockedReason]));
