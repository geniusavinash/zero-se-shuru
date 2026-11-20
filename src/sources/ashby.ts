/**
 * Ashby public job board: one call per board. Unlisted posts are skipped. `isRemote` is also true for
 * hybrid jobs, so the workplace comes from `workplaceType`. The company name comes from config.
 */
import type { Board } from '../config.ts';
import type { HttpClient } from '../http.ts';
import type { Job } from '../types.ts';
import { htmlToText, stripContacts, titleCase } from '../text.ts';
import { type BoardRead, clean, httpsUrl, isRecord, str, toIso, uniq } from './shared.ts';

export function ashbyUrl(name: string): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(name)}?includeCompensation=false`;
}

export function parseAshby(data: unknown, board: Board): BoardRead {
  const list = isRecord(data) ? data.jobs : undefined;
  if (!Array.isArray(list)) return { ok: false, reason: 'no "jobs" list in the answer', jobs: [], skipped: 0 };
  const jobs: Job[] = [];
  let skipped = 0;
  for (const j of list) {
    if (!isRecord(j) || j.isListed === false) {
      if (!isRecord(j)) skipped++;
      continue;
    }
    const url = httpsUrl(j.jobUrl);
    const id = str(j.id) ?? url?.split('/').filter(Boolean).at(-1);
    const title = clean(j.title);
    if (!id || !url || !title) {
      skipped++;
      continue;
    }
    const secondary = Array.isArray(j.secondaryLocations)
      ? j.secondaryLocations.map((s) => (isRecord(s) ? str(s.location) : undefined))
      : [];
    const address = isRecord(j.address) && isRecord(j.address.postalAddress) ? j.address.postalAddress : {};
    const text = str(j.descriptionPlain) ?? (typeof j.descriptionHtml === 'string' ? htmlToText(j.descriptionHtml) : '');
    jobs.push({
      key: `ashby:${board.token}:${id}`,
      source: 'ashby',
      board: board.token,
      sourceId: id,
      title,
      company: board.company || titleCase(board.token),
      locations: uniq([str(j.location), ...secondary]),
      country: str(address.addressCountry),
      workplace: str(j.workplaceType),
      employment: str(j.employmentType),
      description: stripContacts(text),
      postedAt: toIso(j.publishedAt),
      url,
      aggregator: false,
    });
  }
  return { ok: true, jobs, skipped };
}

export async function readAshby(http: HttpClient, board: Board): Promise<BoardRead> {
  const r = await http.getJson(ashbyUrl(board.token), { timeoutMs: 60_000 });
  return r.ok ? parseAshby(r.data, board) : { ok: false, reason: r.reason, jobs: [], skipped: 0 };
}
