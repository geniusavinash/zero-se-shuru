/** Step 3: the free rules. Every post gets one outcome; the counts feed the funnel on the page. */
import type { Config } from './config.ts';
import type { IndiaRule } from './india.ts';
import { capPerCompany, type TitleCall, titleCall, tooOld } from './prefilter.ts';
import type { Job, LocationResult, SourceName } from './types.ts';

export interface Candidate {
  job: Job;
  call: TitleCall;
  loc: LocationResult;
}

export interface ScreenCounts {
  read: number;
  india: number;
  junk: number;
  senior: number;
  old: number;
  overCap: number;
  candidates: number;
}

const zero = (): ScreenCounts => ({ read: 0, india: 0, junk: 0, senior: 0, old: 0, overCap: 0, candidates: 0 });

export function screen(jobs: Job[], cfg: Config, india: IndiaRule, now: Date, cap = cfg.site.max_candidates_per_company) {
  const bySource = new Map<SourceName, ScreenCounts>();
  const count = (s: SourceName): ScreenCounts => {
    let c = bySource.get(s);
    if (!c) bySource.set(s, (c = zero()));
    return c;
  };
  const passed: Candidate[] = [];
  /** Per board: India posts and candidates, counted at their own stages (review fix). */
  const byBoard = new Map<string, { india: number; candidates: number }>();
  const board = (job: Job) => {
    const k = `${job.source}:${job.board}`;
    let b = byBoard.get(k);
    if (!b) byBoard.set(k, (b = { india: 0, candidates: 0 }));
    return b;
  };
  for (const job of jobs) {
    const c = count(job.source);
    c.read++;
    const loc = india({ locations: job.locations, country: job.country, workplace: job.workplace });
    if (!loc.isIndia) continue;
    c.india++;
    board(job).india++;
    const t = titleCall(job.title, cfg.rules);
    if (t.call === 'junk') {
      c.junk++;
      continue;
    }
    if (t.call === 'drop') {
      c.senior++;
      continue;
    }
    if (tooOld(job, job.aggregator ? cfg.site.max_age_days : cfg.site.max_age_days_direct, now)) {
      c.old++;
      continue;
    }
    passed.push({ job, call: t.call, loc });
  }
  // Aggregator posts are not capped per company: each one names a different employer anyway.
  const direct = passed.filter((p) => !p.job.aggregator);
  const kept = [...capPerCompany(direct, cap), ...passed.filter((p) => p.job.aggregator)];
  const keptKeys = new Set(kept.map((k) => k.job.key));
  for (const p of passed) {
    if (keptKeys.has(p.job.key)) {
      count(p.job.source).candidates++;
      board(p.job).candidates++;
    } else count(p.job.source).overCap++;
  }
  return { candidates: kept, bySource, byBoard };
}
