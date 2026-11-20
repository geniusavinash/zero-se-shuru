/**
 * Step 7: the page's data (docs/FRONTEND_CONTRACT.md) and the run record.
 * Writes site/data/{jobs,meta,review}.json and site/js/config.js, and updates data/first_seen.json and
 * data/runs.json. Every number on the page comes from here or from data/metrics.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { BoardStatus } from './collect.ts';
import type { Config } from './config.ts';
import { decide, whyText } from './decide.ts';
import { dedupe } from './dedupe.ts';
import { optionalEnv } from './env.ts';
import type { Overrides } from './overrides.ts';
import type { Candidate, ScreenCounts } from './screen.ts';
import { companyKey } from './text.ts';
import type { DecisionReason, LlmTotals, Row, RunRecord, SourceName, Tags } from './types.ts';

const FIRST_SEEN = 'data/first_seen.json';
const RUNS = 'data/runs.json';
const METRICS = 'data/metrics.json';

export const SOURCE_INFO: Record<SourceName, { display: string; docs: string; terms: string; whyAllowed: string; attribution: string }> = {
  greenhouse: {
    display: 'Greenhouse job boards',
    docs: 'https://developers.greenhouse.io/job-board.html',
    terms: 'https://developers.greenhouse.io/job-board.html',
    whyAllowed: 'A documented public API that companies use to publish their openings; read politely, one request per board.',
    attribution: 'none required',
  },
  lever: {
    display: 'Lever postings',
    docs: 'https://github.com/lever/postings-api',
    terms: 'https://github.com/lever/postings-api',
    whyAllowed: 'A documented public API for published postings; its README says published postings are publicly viewable.',
    attribution: 'none required',
  },
  ashby: {
    display: 'Ashby job boards',
    docs: 'https://developers.ashbyhq.com/docs/public-job-posting-api',
    terms: 'https://developers.ashbyhq.com/docs/public-job-posting-api',
    whyAllowed: 'A documented public job-posting API for company job boards.',
    attribution: 'none required',
  },
  adzuna: {
    display: 'Adzuna',
    docs: 'https://developer.adzuna.com/overview',
    terms: 'https://developer.adzuna.com/docs/terms_of_service',
    whyAllowed: 'The official Adzuna API, used with a key under its terms; every listing carries the Adzuna label.',
    attribution: 'Jobs by Adzuna',
  },
};

export function istDate(d: Date): string {
  return new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export interface BuildInput {
  cfg: Config;
  runId: string;
  trigger: RunRecord['trigger'];
  now: Date;
  startedAt: Date;
  candidates: Candidate[];
  tags: Map<string, Tags>;
  failed: Map<string, string>;
  overrides: Overrides;
  boards: BoardStatus[];
  screenCounts: Map<SourceName, ScreenCounts>;
  byBoard: Map<string, { india: number; candidates: number }>;
  llm: LlmTotals;
  sourcesOn: SourceName[];
}

/**
 * True only for a key that is safe to ship to browsers: a new `sb_publishable_` key, or a legacy JWT whose
 * role claim is `anon`. A secret key (`sb_secret_`) or a `service_role` JWT is never public.
 */
export function isPublicSupabaseKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  const parts = key.split('.');
  if (parts.length !== 3 || !key.startsWith('eyJ')) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8')) as { role?: unknown };
    return payload.role === 'anon';
  } catch {
    return false;
  }
}

export function build(input: BuildInput): { record: RunRecord; shown: number; reasons: Record<string, number> } {
  const { cfg, now, candidates, tags, overrides } = input;
  const today = istDate(now);
  const firstSeen = readJson<Record<string, string>>(FIRST_SEEN, {});
  const reasons: Record<string, number> = {};
  const review: unknown[] = [];
  const rows: Row[] = [];
  let cityMismatch = 0;

  // Employers with any post the LLM called a fee or scam ad in this run. An unnamed employer is never
  // grouped: "Unknown employer" posts are judged one by one.
  const scamCompanies = new Set(
    candidates
      .filter((c) => tags.get(c.job.key)?.genuine === 'pay_or_scam' && c.job.company !== 'Unknown employer')
      .map((c) => companyKey(c.job.company))
      .filter((k) => k !== ''),
  );

  for (const c of candidates) {
    const job = c.job;
    firstSeen[job.key] ??= today;
    const t = tags.get(job.key);
    const ck = companyKey(job.company);
    const d = decide(
      { tags: t, hidden: overrides.hidden.has(job.key), blocked: overrides.blocked.has(ck), scamCompany: scamCompanies.has(ck) },
      cfg.rules.experience_limit_years,
    );
    reasons[d.reason] = (reasons[d.reason] ?? 0) + 1;
    // A post the admin hid or blocked never reaches the published review file (review fix).
    if (d.reason === 'hidden' || d.reason === 'blocked') continue;
    // The ad that triggered a scam hold is listed too, so the admin sees the evidence, not only its siblings
    // (review fix, round 2). review.json holds only public post data.
    if (t?.genuine === 'pay_or_scam') {
      review.push({ key: job.key, title: job.title, company: job.company, companyKey: ck, source: job.source, url: job.url, reason: 'scam_flagged', role: t.role, llmCities: t.cities, ruleCities: c.loc.cities });
    }
    // Held back with its employer: listed in the review queue so the admin can check it.
    if (d.reason === 'scam_company' && t) {
      review.push({ key: job.key, title: job.title, company: job.company, companyKey: ck, source: job.source, url: job.url, reason: 'scam_company', role: t.role, llmCities: t.cities, ruleCities: c.loc.cities });
      continue;
    }
    if (!t) {
      const why = input.failed.get(job.key);
      if (why) review.push({ key: job.key, title: job.title, company: job.company, companyKey: ck, source: job.source, url: job.url, reason: why === 'refused' ? 'refused' : why === 'incomplete' ? 'incomplete' : 'untagged', llmCities: [], ruleCities: c.loc.cities });
      continue;
    }
    const llmCities = t.cities.filter((x) => x !== 'other_india');
    const ruleCities = c.loc.cities.filter((x) => x !== 'other_india');
    if (ruleCities.length > 0 && !sameSet(llmCities, ruleCities)) {
      cityMismatch++;
      if (d.shown) review.push({ key: job.key, title: job.title, company: job.company, companyKey: ck, source: job.source, url: job.url, reason: 'city_mismatch', role: t.role, llmCities: t.cities, ruleCities: c.loc.cities });
    }
    if (!d.shown) continue;
    const fix = overrides.tagFixes.get(job.key);
    // The card shows the LLM's cities; when it named none but the location rule did, the rule's cities.
    const cities = fix?.cities ?? (t.cities.length > 0 ? t.cities : c.loc.cities);
    rows.push({
      key: job.key,
      title: job.title,
      company: job.company,
      companyKey: ck,
      role: fix?.role ?? t.role,
      cities,
      cityLinks: cities.map((city) => ({ city, url: job.url })),
      locationText: job.locations.join(' | ') || 'India',
      remote: c.loc.remote || t.location_status === 'remote_india',
      jobType: t.job_type,
      postedAt: job.postedAt,
      firstSeen: firstSeen[job.key] ?? today,
      source: job.source,
      aggregator: job.aggregator,
      url: job.url,
      why: whyText(t, d, job.aggregator),
      isNew: (firstSeen[job.key] ?? today) === today,
      overridden: fix !== undefined,
      memberKeys: [],
    });
  }

  const deduped = dedupe(rows);
  const order = (r: Row): string => r.postedAt ?? `${r.firstSeen}T00:00:00Z`;
  const sorted = deduped.rows.sort((a, b) => Number(b.isNew) - Number(a.isNew) || order(b).localeCompare(order(a)));
  const perCompany = new Map<string, number>();
  let adzuna = 0;
  const shownRows = sorted.filter((r) => {
    const n = perCompany.get(r.companyKey) ?? 0;
    if (n >= cfg.site.max_shown_per_company) return false;
    if (r.aggregator && adzuna >= cfg.site.max_adzuna_shown) return false;
    perCompany.set(r.companyKey, n + 1);
    if (r.aggregator) adzuna++;
    return true;
  });

  const sources = [...new Set<SourceName>([...input.screenCounts.keys(), ...input.sourcesOn])];
  const funnelFor = (s?: SourceName) => {
    const sc = s ? [input.screenCounts.get(s)].filter(Boolean) : [...input.screenCounts.values()];
    const sum = (k: keyof ScreenCounts): number => sc.reduce((a, x) => a + (x?.[k] ?? 0), 0);
    const inSrc = (r: { source: SourceName }): boolean => !s || r.source === s;
    return {
      read: sum('read'),
      india: sum('india'),
      candidates: sum('candidates'),
      tagged: candidates.filter((c) => inSrc(c.job) && tags.has(c.job.key)).length,
      eligible: rows.filter(inSrc).length,
      afterDedupe: deduped.rows.filter(inSrc).length,
      shown: shownRows.filter(inSrc).length,
    };
  };

  const record: RunRecord = {
    id: input.runId,
    startedAt: input.startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    trigger: input.trigger,
    ok: shownRows.length >= cfg.site.min_shown,
    blockedReason: shownRows.length >= cfg.site.min_shown ? undefined : `only ${shownRows.length} posts would be shown (minimum ${cfg.site.min_shown})`,
    newPosts: shownRows.filter((r) => r.isNew).length,
    model: cfg.model.model_id,
    promptVersion: cfg.model.prompt_version,
    counts: { ...funnelFor(), duplicates: deduped.removed, cityMismatch },
    perSource: {},
    llm: input.llm,
  };
  const runs = [record, ...readJson<RunRecord[]>(RUNS, [])].slice(0, 60);

  const meta = {
    site: {
      name: cfg.site.name,
      tagline: cfg.site.tagline,
      publicUrl: cfg.site.public_url,
      repoUrl: cfg.site.repo_url,
      panels: cfg.site.panels,
      contact: optionalEnv('CONTACT_EMAIL') ?? '',
      staleAfterHours: cfg.site.stale_after_hours,
    },
    generatedAt: now.toISOString(),
    runId: input.runId,
    trigger: input.trigger,
    model: cfg.model.model_id,
    promptVersion: cfg.model.prompt_version,
    counts: {
      shown: shownRows.length,
      companies: new Set(shownRows.map((r) => r.companyKey)).size,
      newToday: shownRows.filter((r) => r.isNew).length,
      duplicatesRemoved: deduped.removed,
      cityMismatch,
    },
    funnel: { total: funnelFor(), bySource: Object.fromEntries(sources.map((s) => [s, funnelFor(s)])) },
    sources: sources.map((s) => ({
      name: s,
      ...SOURCE_INFO[s],
      boardsOk: input.boards.filter((b) => b.ats === s && b.on && b.ok).length,
      boardsFailed: input.boards.filter((b) => b.ats === s && b.on && !b.ok).length,
      on: input.sourcesOn.includes(s),
    })),
    // Company boards only: Adzuna is a source, not a switchable board (review fix).
    boards: input.boards
      .filter((b) => b.ats !== 'adzuna')
      .map((b) => ({
        ats: b.ats,
        token: b.token,
        company: b.company,
        on: b.on,
        ok: b.ok,
        reason: b.reason,
        india: input.byBoard.get(`${b.ats}:${b.token}`)?.india ?? 0,
        candidates: input.byBoard.get(`${b.ats}:${b.token}`)?.candidates ?? 0,
        shown: shownRows.filter((r) => r.key.startsWith(`${b.ats}:${b.token}:`)).length,
      })),
    metrics: readJson<unknown>(METRICS, null),
    runs: runs.slice(0, 14).map((r) => ({
      id: r.id,
      startedAt: r.startedAt,
      trigger: r.trigger,
      ok: r.ok,
      shown: r.counts.shown,
      newPosts: r.newPosts,
      llmCalls: r.llm.calls,
      costUsd: Number(r.llm.costUsd.toFixed(4)),
      blockedReason: r.blockedReason,
    })),
    roles: cfg.taxonomy.roles.map((r) => ({ id: r.id, name: r.name })),
    cities: [...cfg.taxonomy.cities, ...cfg.taxonomy.special_cities].map((c) => ({ id: c.id, name: c.name, aliases: c.aliases })),
    metroGroups: cfg.taxonomy.metro_groups,
    reasons: reasons as Partial<Record<DecisionReason, number>>,
  };

  mkdirSync('site/data', { recursive: true });
  mkdirSync('data', { recursive: true });
  writeFileSync('site/data/jobs.json', JSON.stringify(shownRows));
  writeFileSync('site/data/meta.json', JSON.stringify(meta));
  writeFileSync('site/data/review.json', JSON.stringify(review));
  writeFileSync(FIRST_SEEN, `${JSON.stringify(firstSeen)}\n`);
  writeFileSync(RUNS, `${JSON.stringify(runs, null, 1)}\n`);
  const supaUrl = optionalEnv('SUPABASE_URL');
  const supaKey = optionalEnv('SUPABASE_PUBLISHABLE_KEY');
  // config.js is downloaded by every visitor: refuse anything but a public key (review fix, round 2).
  if (supaKey && !isPublicSupabaseKey(supaKey)) {
    throw new Error('SUPABASE_PUBLISHABLE_KEY is not a publishable (or anon) key; refusing to publish it.');
  }
  if (supaUrl && !/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(supaUrl)) {
    throw new Error('SUPABASE_URL is not a https://<project-ref>.supabase.co address.');
  }
  writeFileSync(
    'site/js/config.js',
    `window.ZSS_CONFIG = ${JSON.stringify({ supabaseUrl: supaUrl ?? '', supabaseKey: supaKey ?? '', panels: Boolean(cfg.site.panels && supaUrl && supaKey) })};\n`,
  );
  return { record, shown: shownRows.length, reasons };
}
