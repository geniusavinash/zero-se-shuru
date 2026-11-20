/**
 * Lever Postings API, in pages of 100. `descriptionPlain` can be empty (seen live 2026-11-20), so the
 * description joins opening, body, lists and additional text. The company name comes from config.
 */
import type { Board } from '../config.ts';
import type { HttpClient } from '../http.ts';
import type { Job } from '../types.ts';
import { htmlToText, stripContacts, titleCase } from '../text.ts';
import { type BoardRead, clean, httpsUrl, isRecord, str, toIso, uniq } from './shared.ts';

const PAGE = 100;
const MAX_PAGES = 30;

export function leverUrl(site: string, skip: number): string {
  return `https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json&skip=${skip}&limit=${PAGE}`;
}

function describe(p: Record<string, unknown>): string {
  const parts: string[] = [];
  const opening = str(p.openingPlain);
  const body = str(p.descriptionBodyPlain) ?? str(p.descriptionPlain);
  if (opening) parts.push(opening);
  if (body && body !== opening) parts.push(body);
  if (Array.isArray(p.lists)) {
    for (const l of p.lists) {
      if (!isRecord(l)) continue;
      const head = str(l.text);
      const content = typeof l.content === 'string' ? htmlToText(l.content) : '';
      if (head || content) parts.push([head, content].filter(Boolean).join('\n'));
    }
  }
  const extra = str(p.additionalPlain);
  if (extra) parts.push(extra);
  if (parts.length === 0 && typeof p.description === 'string') parts.push(htmlToText(p.description));
  return stripContacts(parts.join('\n\n'));
}

export function parseLeverPage(data: unknown, board: Board): { jobs: Job[]; skipped: number; count: number } | undefined {
  if (!Array.isArray(data)) return undefined;
  const jobs: Job[] = [];
  let skipped = 0;
  for (const p of data) {
    if (!isRecord(p)) {
      skipped++;
      continue;
    }
    const id = str(p.id);
    const url = httpsUrl(p.hostedUrl);
    const title = clean(p.text);
    if (!id || !url || !title) {
      skipped++;
      continue;
    }
    const cat = isRecord(p.categories) ? p.categories : {};
    const all = Array.isArray(cat.allLocations) ? (cat.allLocations as unknown[]).map((x) => (typeof x === 'string' ? x : undefined)) : [];
    jobs.push({
      key: `lever:${board.token}:${id}`,
      source: 'lever',
      board: board.token,
      sourceId: id,
      title,
      company: board.company || titleCase(board.token),
      locations: uniq([str(cat.location), ...all]),
      country: str(p.country),
      workplace: str(p.workplaceType),
      employment: str(cat.commitment),
      description: describe(p),
      postedAt: toIso(p.createdAt),
      url,
      aggregator: false,
    });
  }
  return { jobs, skipped, count: data.length };
}

export async function readLever(http: HttpClient, board: Board): Promise<BoardRead> {
  const jobs: Job[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await http.getJson(leverUrl(board.token, page * PAGE), { timeoutMs: 60_000 });
    if (!r.ok) return { ok: false, reason: page === 0 ? r.reason : `page ${page + 1}: ${r.reason}`, jobs: [], skipped };
    const parsed = parseLeverPage(r.data, board);
    if (!parsed) return { ok: false, reason: 'the answer was not a list', jobs: [], skipped };
    skipped += parsed.skipped;
    let fresh = 0;
    for (const j of parsed.jobs) {
      if (seen.has(j.key)) continue;
      seen.add(j.key);
      jobs.push(j);
      fresh++;
    }
    if (parsed.count < PAGE || fresh === 0) break;
  }
  return { ok: true, jobs, skipped };
}
