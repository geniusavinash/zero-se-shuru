/**
 * Adzuna India search API (official, with a key). Each listing shown must carry the Adzuna label
 * (terms: the word "Adzuna", at least 116×23 px, linked to the local site). The description is only a
 * snippet. The app_key travels in the URL, so nothing here ever prints a URL.
 * Parameters other than what/where/results_per_page/sort_by are kept only if they change `count` (T6).
 */
import type { HttpClient } from '../http.ts';
import type { Job } from '../types.ts';
import { htmlToText, sha256, stripContacts } from '../text.ts';
import { type BoardRead, clean, isRecord, str, toIso } from './shared.ts';

export interface AdzunaQuery {
  name: string;
  params: Record<string, string>;
}

export const ADZUNA_QUERIES: AdzunaQuery[] = [
  { name: 'intern', params: { what_or: 'intern internship interns internships' } },
  { name: 'fresher', params: { what_or: 'fresher freshers' } },
  { name: 'trainee', params: { what_or: 'trainee trainees apprentice apprenticeship' } },
  { name: 'graduate', params: { what_phrase: 'graduate trainee' } },
  { name: 'entry', params: { what_phrase: 'entry level' } },
];

export function adzunaUrl(appId: string, appKey: string, q: AdzunaQuery, page: number, perPage = 50, maxDays = 30): string {
  const p = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(perPage),
    max_days_old: String(maxDays),
    sort_by: 'date',
    'content-type': 'application/json',
    ...q.params,
  });
  return `https://api.adzuna.com/v1/api/jobs/in/search/${page}?${p.toString()}`;
}

/** Adzuna's documented examples use http:// links; its own site serves https, so its links are upgraded. */
export function adzunaLink(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    if (u.protocol === 'http:' && /(^|\.)adzuna\.[a-z.]+$/i.test(u.hostname)) u.protocol = 'https:';
    return u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function parseAdzunaPage(data: unknown): { jobs: Job[]; skipped: number; count?: number } | undefined {
  if (!isRecord(data) || !Array.isArray(data.results)) return undefined;
  const jobs: Job[] = [];
  let skipped = 0;
  for (const r of data.results) {
    if (!isRecord(r)) {
      skipped++;
      continue;
    }
    const id = typeof r.id === 'string' || typeof r.id === 'number' ? String(r.id) : undefined;
    const url = adzunaLink(r.redirect_url);
    const title = clean(htmlToText(String(r.title ?? '')));
    if (!id || !url || !title) {
      skipped++;
      continue;
    }
    const company = isRecord(r.company) ? clean(r.company.display_name) : '';
    const location = isRecord(r.location) ? r.location : {};
    const area = Array.isArray(location.area) ? (location.area as unknown[]).filter((a): a is string => typeof a === 'string') : [];
    jobs.push({
      key: `adzuna:${sha256(id).slice(0, 16)}`,
      source: 'adzuna',
      board: 'in',
      sourceId: id,
      title,
      company: company || 'Unknown employer',
      locations: [str(location.display_name), ...area.slice(1)].filter((x): x is string => x !== undefined).map((x) => clean(x)),
      country: area[0],
      employment: [str(r.contract_time), str(r.contract_type)].filter(Boolean).join(' ') || undefined,
      description: stripContacts(htmlToText(String(r.description ?? ''))),
      postedAt: toIso(r.created),
      url,
      aggregator: true,
    });
  }
  return { jobs, skipped, count: typeof data.count === 'number' ? data.count : undefined };
}

export async function readAdzuna(
  http: HttpClient,
  creds: { appId: string; appKey: string },
  opts: { pages?: number; maxDays?: number; log?: (s: string) => void } = {},
): Promise<BoardRead & { calls: number; counts: Record<string, number | undefined> }> {
  const pages = opts.pages ?? 3;
  const byKey = new Map<string, Job>();
  const counts: Record<string, number | undefined> = {};
  let skipped = 0;
  let calls = 0;
  let failures = 0;
  for (const q of ADZUNA_QUERIES) {
    for (let page = 1; page <= pages; page++) {
      calls++;
      const r = await http.getJson(adzunaUrl(creds.appId, creds.appKey, q, page, 50, opts.maxDays ?? 30), { timeoutMs: 30_000 });
      if (!r.ok) {
        failures++;
        opts.log?.(`  adzuna ${q.name} page ${page}: ${r.reason}`);
        if (r.status === 401 || r.status === 403 || r.status === 429) return { ok: byKey.size > 0, reason: r.reason, jobs: [...byKey.values()], skipped, calls, counts };
        break;
      }
      const parsed = parseAdzunaPage(r.data);
      if (!parsed) {
        failures++;
        break;
      }
      if (page === 1) counts[q.name] = parsed.count;
      skipped += parsed.skipped;
      for (const j of parsed.jobs) if (!byKey.has(j.key)) byKey.set(j.key, j);
      if (parsed.jobs.length < 50) break;
    }
  }
  return { ok: byKey.size > 0, reason: failures > 0 ? `${failures} query pages failed` : undefined, jobs: [...byKey.values()], skipped, calls, counts };
}
