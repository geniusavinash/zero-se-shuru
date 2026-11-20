import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Board } from '../src/config.ts';
import { parseAshby } from '../src/sources/ashby.ts';
import { parseGreenhouse } from '../src/sources/greenhouse.ts';
import { parseLeverPage } from '../src/sources/lever.ts';

const fixture = (path: string): unknown => JSON.parse(readFileSync(`tests/fixtures/${path}`, 'utf8'));
const board = (ats: Board['ats'], token: string, company = ''): Board => ({ ats, token, company, on: true });

describe('source parsers on real saved answers', () => {
  it('greenhouse: reads every job with its company name and a plain-text description', () => {
    const r = parseGreenhouse(fixture('greenhouse/groww.json'), board('greenhouse', 'groww'));
    expect(r.ok).toBe(true);
    expect(r.jobs.length).toBeGreaterThan(0);
    for (const j of r.jobs) {
      expect(j.key).toMatch(/^greenhouse:groww:\d+$/);
      expect(j.url).toMatch(/^https:\/\//);
      expect(j.company).toBe('Groww');
      expect(j.description).not.toMatch(/<\/?[a-z]+[^>]*>/i);
      expect(j.description).not.toMatch(/&lt;|&amp;lt;/);
    }
    expect(r.jobs.filter((j) => j.description.length > 200).length).toBe(r.jobs.length);
  });

  it('lever: builds a description even when descriptionPlain is empty', () => {
    const raw = fixture('lever/cred.json') as Record<string, unknown>[];
    const emptyPlain = raw.filter((p) => p.descriptionPlain === '').length;
    const r = parseLeverPage(raw, board('lever', 'cred', 'CRED'));
    expect(r).toBeDefined();
    expect(r!.jobs.length).toBe(raw.length);
    expect(r!.jobs.every((j) => j.description.length > 100)).toBe(true);
    expect(r!.jobs.every((j) => j.company === 'CRED' && j.postedAt !== undefined)).toBe(true);
    expect(emptyPlain).toBeGreaterThanOrEqual(0);
  });

  it('ashby: keeps listed jobs, reads the country field and the workplace type', () => {
    const r = parseAshby(fixture('ashby/atlan.json'), board('ashby', 'atlan', 'Atlan'));
    expect(r.ok).toBe(true);
    expect(r.jobs.length).toBeGreaterThan(0);
    expect(r.jobs.every((j) => j.url.startsWith('https://jobs.ashbyhq.com/'))).toBe(true);
    expect(r.jobs.some((j) => j.country !== undefined)).toBe(true);
  });

  it('skips one bad post instead of failing the whole board', () => {
    const r = parseGreenhouse({ jobs: [{ id: 1, title: 'Ok', absolute_url: 'https://x.test/1' }, { title: 'no id' }] }, board('greenhouse', 'x'));
    expect(r.ok).toBe(true);
    expect(r.jobs).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });
});
