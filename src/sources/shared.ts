/** Helpers shared by the source adapters. Every adapter skips a bad post and counts it; it never fails a board for one post. */
import type { Job } from '../types.ts';
import { stripContacts } from '../text.ts';

export interface BoardRead {
  ok: boolean;
  reason?: string;
  jobs: Job[];
  /** Posts skipped because a required field (id, title, link) was missing. */
  skipped: number;
}

export type Loose = Record<string, unknown>;

export function isRecord(v: unknown): v is Loose {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

/** Short fields (title, company, location): whitespace collapsed, contacts removed. */
export function clean(v: unknown): string {
  return typeof v === 'string' ? stripContacts(v.replace(/\s+/g, ' ').trim()) : '';
}

export function uniq(values: (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const c = clean(v);
    if (c !== '' && !out.includes(c)) out.push(c);
  }
  return out;
}

/** ISO UTC from an ISO string or epoch milliseconds; undefined for anything else or outside 2000–2100. */
export function toIso(v: unknown): string | undefined {
  const ms = typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : Number.NaN;
  if (!Number.isFinite(ms)) return undefined;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  return y >= 2000 && y <= 2100 ? d.toISOString() : undefined;
}

export function httpsUrl(v: unknown): string | undefined {
  const s = str(v);
  return s !== undefined && /^https:\/\//i.test(s) ? s : undefined;
}
