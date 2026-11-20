/**
 * Greenhouse Job Board API: one call per board, descriptions included (`content=true`, seen live
 * 2026-11-20). `company_name` is on every job. `updated_at` is not a posting date; `first_published` is.
 */
import type { Board } from '../config.ts';
import type { HttpClient } from '../http.ts';
import type { Job } from '../types.ts';
import { htmlToText, stripContacts, titleCase } from '../text.ts';
import { type BoardRead, clean, httpsUrl, isRecord, toIso, uniq } from './shared.ts';

export function greenhouseUrl(token: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;
}

export function parseGreenhouse(data: unknown, board: Board): BoardRead {
  const list = isRecord(data) ? data.jobs : undefined;
  if (!Array.isArray(list)) return { ok: false, reason: 'no "jobs" list in the answer', jobs: [], skipped: 0 };
  const jobs: Job[] = [];
  let skipped = 0;
  for (const j of list) {
    if (!isRecord(j)) {
      skipped++;
      continue;
    }
    const id = typeof j.id === 'number' || typeof j.id === 'string' ? String(j.id) : undefined;
    const url = httpsUrl(j.absolute_url);
    const title = clean(j.title);
    if (!id || !url || !title) {
      skipped++;
      continue;
    }
    const location = isRecord(j.location) ? j.location.name : undefined;
    const offices = Array.isArray(j.offices) ? j.offices.map((o) => (isRecord(o) ? o.name : undefined)) : [];
    jobs.push({
      key: `greenhouse:${board.token}:${id}`,
      source: 'greenhouse',
      board: board.token,
      sourceId: id,
      title,
      company: clean(j.company_name) || board.company || titleCase(board.token),
      locations: uniq([location as string | undefined, ...(offices as (string | undefined)[])]),
      description: stripContacts(htmlToText(typeof j.content === 'string' ? j.content : '')),
      postedAt: toIso(j.first_published),
      url,
      aggregator: false,
    });
  }
  return { ok: true, jobs, skipped };
}

export async function readGreenhouse(http: HttpClient, board: Board): Promise<BoardRead> {
  const r = await http.getJson(greenhouseUrl(board.token), { timeoutMs: 60_000 });
  return r.ok ? parseGreenhouse(r.data, board) : { ok: false, reason: r.reason, jobs: [], skipped: 0 };
}
