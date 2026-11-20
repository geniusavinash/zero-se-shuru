/**
 * npm run refresh: the whole pipeline (ARCHITECTURE §2).
 *   0 admin overrides (Supabase) → 1 collect → 2 normalise (in the adapters) → 3 screen (free rules)
 *   → 4 tag (LLM, cached) → 5 decide → 6 dedupe → 7 build the page data and the run record.
 *
 * Flags:
 *   --no-llm            stop after the count table
 *   --offline           read .cache/snapshot.json instead of calling the sources
 *   --source <ats>      only one source
 *   --limit N --seed S  tag only N candidates (seeded, at most 3 per company): for prompt tuning;
 *                       their keys are saved to eval/tuning_keys.json and never drawn for the 50
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { userAgent } from './agent.ts';
import { build } from './build.ts';
import { type BoardStatus, collectBoards } from './collect.ts';
import { type Board, loadConfig } from './config.ts';
import { loadEnv, optionalEnv, requireEnv } from './env.ts';
import { readAdzuna } from './sources/adzuna.ts';
import { createHttp } from './http.ts';
import { makeIndiaRule } from './india.ts';
import { connectionFromEnv, createLlm } from './llm.ts';
import { loadOverrides } from './overrides.ts';
import { seeded } from './random.ts';
import { type Candidate, screen } from './screen.ts';
import { tagAll } from './tagger.ts';
import { fold } from './text.ts';
import type { Job, RunRecord, SourceName } from './types.ts';

const SNAPSHOT = '.cache/snapshot.json';
const TUNING_KEYS = 'eval/tuning_keys.json';
const flag = (name: string): boolean => process.argv.includes(`--${name}`);
const value = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function sample(cands: Candidate[], n: number, seed: number): Candidate[] {
  const rnd = seeded(seed);
  const shuffled = [...cands].sort((a, b) => a.job.key.localeCompare(b.job.key)).map((c) => ({ c, r: rnd() })).sort((a, b) => a.r - b.r).map((x) => x.c);
  const perCompany = new Map<string, number>();
  const out: Candidate[] = [];
  for (const c of shuffled) {
    const k = fold(c.job.company);
    if ((perCompany.get(k) ?? 0) >= 3) continue;
    perCompany.set(k, (perCompany.get(k) ?? 0) + 1);
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

function triggerOf(): RunRecord['trigger'] {
  if (process.env.GITHUB_ACTIONS !== 'true') return 'local';
  return process.env.GITHUB_EVENT_NAME === 'schedule' ? 'schedule' : 'manual';
}

async function main(): Promise<void> {
  loadEnv();
  const cfg = loadConfig();
  const startedAt = new Date();
  const trigger = triggerOf();
  const runId = `${startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19)}Z-${trigger}`;
  const log = (s: string): void => console.log(s);
  const inActions = trigger !== 'local';

  const overrides = await loadOverrides();
  if (overrides.note) log(overrides.note);

  let jobs: Job[];
  let boards: BoardStatus[];
  if (flag('offline')) {
    if (!existsSync(SNAPSHOT)) throw new Error(`${SNAPSHOT} does not exist: run once without --offline first.`);
    ({ jobs, boards } = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as { jobs: Job[]; boards: BoardStatus[] });
    log(`offline: ${jobs.length} posts from ${SNAPSHOT}`);
  } else {
    const http = createHttp({ userAgent: userAgent(cfg), gapMs: (host) => (host.includes('adzuna') ? 3000 : 1000) });
    const t0 = Date.now();
    const only = value('source');
    const appId = optionalEnv('ADZUNA_APP_ID');
    const appKey = optionalEnv('ADZUNA_APP_KEY');
    const wantAdzuna = (!only || only === 'adzuna') && appId !== undefined && appKey !== undefined;
    if (!appId || !appKey) log('Adzuna keys not set: company boards only');
    log(`collecting from ${only === 'adzuna' ? 0 : cfg.boards.filter((b) => b.on).length} boards${wantAdzuna ? ' and Adzuna' : ''}...`);
    const [boardRead, adz] = await Promise.all([
      only === 'adzuna' ? Promise.resolve({ jobs: [] as Job[], boards: [] as BoardStatus[] }) : collectBoards(cfg, http, { only: only as Board['ats'] | undefined, boardSwitches: overrides.boardSwitches, log }),
      wantAdzuna ? readAdzuna(http, { appId: appId!, appKey: appKey! }, { log, pages: cfg.site.adzuna_pages }) : Promise.resolve(undefined),
    ]);
    jobs = [...boardRead.jobs, ...(adz?.jobs ?? [])];
    boards = boardRead.boards;
    if (adz) {
      log(`adzuna: ${adz.jobs.length} posts from ${adz.calls} calls${adz.reason ? ` (${adz.reason})` : ''}; total counts per query ${JSON.stringify(adz.counts)}`);
      boards.push({ ats: 'adzuna', token: 'in', company: 'Adzuna', on: true, ok: adz.ok, reason: adz.reason, posts: adz.jobs.length, skipped: adz.skipped });
    }
    log(`collected ${jobs.length} posts in ${Math.round((Date.now() - t0) / 1000)} s`);
    mkdirSync('.cache', { recursive: true });
    writeFileSync(SNAPSHOT, JSON.stringify({ at: startedAt.toISOString(), jobs, boards }));
  }

  const india = makeIndiaRule(cfg.taxonomy);
  const { candidates, bySource, byBoard } = screen(jobs, cfg, india, startedAt);

  log('\nsource      boards ok/failed   posts   India   junk  senior   old  over-cap  candidates');
  for (const [source, c] of bySource) {
    const b = boards.filter((x) => x.ats === source && x.on);
    log(
      `${source.padEnd(11)} ${String(b.filter((x) => x.ok).length).padStart(6)}/${String(b.filter((x) => !x.ok).length).padEnd(9)} ${String(c.read).padStart(6)} ${String(c.india).padStart(7)} ${String(c.junk).padStart(6)} ${String(c.senior).padStart(7)} ${String(c.old).padStart(5)} ${String(c.overCap).padStart(9)} ${String(c.candidates).padStart(11)}`,
    );
  }
  for (const f of boards.filter((b) => b.on && !b.ok)) log(`  failed: ${f.ats}:${f.token} ${f.reason ?? ''}`);
  const keep = candidates.filter((c) => c.call === 'keep').length;
  log(`candidates: ${candidates.length} (${keep} entry-level titles, ${candidates.length - keep} for the LLM to judge)`);
  if (flag('no-llm')) return;

  let toTag = candidates;
  const limit = value('limit');
  if (limit) {
    toTag = sample(candidates, Number(limit), Number(value('seed') ?? '1'));
    mkdirSync('eval', { recursive: true });
    const previous: string[] = existsSync(TUNING_KEYS) ? (JSON.parse(readFileSync(TUNING_KEYS, 'utf8')) as string[]) : [];
    writeFileSync(TUNING_KEYS, `${JSON.stringify([...new Set([...previous, ...toTag.map((c) => c.job.key)])], null, 1)}\n`);
    log(`tuning sample: ${toTag.length} posts (keys saved to ${TUNING_KEYS})`);
  }

  // A dry run (workflow input) makes no new LLM call and has no minimum count: it proves the deploy path.
  const dryRun = flag('dry-run') || process.env.DRY_RUN === 'true';
  if (dryRun) {
    cfg.site.min_shown = 0;
    log('dry run: cached tags only, no minimum count');
  }
  const llm = createLlm(cfg.model, connectionFromEnv(dryRun));
  const tagged = await tagAll(
    toTag.map((c) => c.job),
    cfg,
    llm,
    {
      runId,
      log,
      ...(dryRun ? { maxNewCalls: 0 } : inActions ? { maxNewCalls: cfg.site.actions_max_new_tags, maxMinutes: cfg.site.actions_max_minutes } : {}),
    },
  );
  const t = tagged.totals;
  log(`LLM: ${t.calls} calls, ${t.cacheHits} cached, ${tagged.failed.size} failed, ${tagged.waiting} waiting · input ${t.input} (cached ${t.cachedInput}) · output ${t.output} · $${t.costUsd.toFixed(4)}`);

  if (limit) {
    // A tuning run never builds the page; it prints what the model said for review.
    const out = toTag.map((c) => ({ key: c.job.key, title: c.job.title, company: c.job.company, locations: c.job.locations, rule: c.loc.cities, tags: tagged.tags.get(c.job.key) ?? null, failed: tagged.failed.get(c.job.key) }));
    mkdirSync('.cache/out', { recursive: true });
    writeFileSync('.cache/out/tuning.json', JSON.stringify(out, null, 1));
    log('wrote .cache/out/tuning.json');
    return;
  }

  const sourcesOn: SourceName[] = ['greenhouse', 'lever', 'ashby'];
  if (jobs.some((j) => j.source === 'adzuna')) sourcesOn.push('adzuna');
  const { record, shown, reasons } = build({ cfg, runId, trigger, now: new Date(), startedAt, candidates, tags: tagged.tags, failed: tagged.failed, overrides, boards, screenCounts: bySource, byBoard, llm: t, sourcesOn });
  log(`decisions: ${JSON.stringify(reasons)}`);
  log(`shown: ${shown} (duplicates removed ${record.counts.duplicates}, city mismatches ${record.counts.cityMismatch})`);
  if (!record.ok) {
    log(`BLOCKED: ${record.blockedReason}. Nothing should be deployed.`);
    process.exitCode = 2;
  }
}

main().catch((err: unknown) => {
  console.error(`refresh failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
