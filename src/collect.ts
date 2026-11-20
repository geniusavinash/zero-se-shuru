/** Step 1: read every switched-on company board. Hosts run in parallel, one request at a time per host. */
import type { Board, Config } from './config.ts';
import type { HttpClient } from './http.ts';
import { readAshby } from './sources/ashby.ts';
import { readGreenhouse } from './sources/greenhouse.ts';
import { readLever } from './sources/lever.ts';
import type { BoardRead } from './sources/shared.ts';
import type { Job, SourceName } from './types.ts';

export interface BoardStatus {
  ats: SourceName;
  token: string;
  company: string;
  on: boolean;
  ok: boolean;
  reason?: string;
  posts: number;
  skipped: number;
}

const READERS: Record<Board['ats'], (http: HttpClient, b: Board) => Promise<BoardRead>> = {
  greenhouse: readGreenhouse,
  lever: readLever,
  ashby: readAshby,
};

export async function collectBoards(
  cfg: Config,
  http: HttpClient,
  opts: { only?: Board['ats']; boardSwitches?: Map<string, boolean>; log?: (s: string) => void } = {},
): Promise<{ jobs: Job[]; boards: BoardStatus[] }> {
  const boards = cfg.boards.map((b) => {
    const sw = opts.boardSwitches?.get(`${b.ats}:${b.token}`);
    return { ...b, on: sw ?? b.on };
  });
  const active = boards.filter((b) => b.on && (!opts.only || b.ats === opts.only));
  let done = 0;
  const reads = await Promise.all(
    active.map(async (b) => {
      const r = await READERS[b.ats](http, b);
      done++;
      if (done % 25 === 0 || done === active.length) opts.log?.(`  read ${done}/${active.length} boards`);
      return { b, r };
    }),
  );
  const statuses: BoardStatus[] = boards
    .filter((b) => !b.on)
    .map((b) => ({ ats: b.ats, token: b.token, company: b.company, on: false, ok: false, reason: 'switched off', posts: 0, skipped: 0 }));
  const jobs: Job[] = [];
  for (const { b, r } of reads) {
    statuses.push({ ats: b.ats, token: b.token, company: r.jobs[0]?.company ?? b.company, on: true, ok: r.ok, reason: r.reason, posts: r.jobs.length, skipped: r.skipped });
    jobs.push(...r.jobs);
  }
  return { jobs, boards: statuses };
}
