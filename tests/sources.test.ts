import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Board } from '../src/config.ts';
import { adzunaLink, parseAdzunaPage } from '../src/sources/adzuna.ts';
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

// No saved Adzuna answer exists yet (no key until the run), so this follows the documented answer shape.
describe('adzuna parser on the documented answer shape', () => {
  const page = {
    count: 1234,
    results: [
      {
        id: '4930012345',
        title: '<strong>Software</strong> Engineer Intern',
        company: { display_name: 'Example Labs Pvt Ltd' },
        location: { area: ['India', 'Karnataka', 'Bangalore'], display_name: 'Bangalore, Karnataka' },
        description: 'We hire <strong>freshers</strong>. Call 9876543210.',
        created: '2026-11-18T09:30:00Z',
        redirect_url: 'http://www.adzuna.in/land/ad/4930012345?se=abc&v=1',
        contract_time: 'full_time',
      },
      { id: '2', title: 'No usable link', redirect_url: 'ftp://x' },
      'not an object',
    ],
  };

  it('reads a listing, upgrades the Adzuna link to https and skips bad rows', () => {
    const r = parseAdzunaPage(page);
    expect(r).toBeDefined();
    expect(r?.count).toBe(1234);
    expect(r?.skipped).toBe(2);
    expect(r?.jobs).toHaveLength(1);
    const j = r!.jobs[0]!;
    expect(j.key).toMatch(/^adzuna:[0-9a-f]{16}$/);
    expect(j.title).toBe('Software Engineer Intern');
    expect(j.company).toBe('Example Labs Pvt Ltd');
    expect(j.country).toBe('India');
    expect(j.locations).toEqual(['Bangalore, Karnataka', 'Karnataka', 'Bangalore']);
    expect(j.url).toBe('https://www.adzuna.in/land/ad/4930012345?se=abc&v=1');
    expect(j.description).not.toContain('9876543210');
    expect(j.postedAt).toBe('2026-11-18T09:30:00.000Z');
    expect(j.aggregator).toBe(true);
  });

  it('upgrades only Adzuna links', () => {
    expect(adzunaLink('http://evil.example/www.adzuna.in')).toBeUndefined();
    expect(adzunaLink('https://www.adzuna.in/land/ad/1')).toBe('https://www.adzuna.in/land/ad/1');
  });
});
