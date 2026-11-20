import { describe, expect, it } from 'vitest';
import { decide, whyText } from '../src/decide.ts';
import { dedupe } from '../src/dedupe.ts';
import type { Row, Tags } from '../src/types.ts';

const tags = (t: Partial<Tags>): Tags => ({
  evidence: '',
  min_experience_years: null,
  invites_freshers: false,
  job_type: 'full_time',
  genuine: 'ok',
  in_india: true,
  role: 'software_development',
  cities: [],
  location_status: 'unknown',
  ...t,
});

describe('decide', () => {
  it.each<[Partial<Tags>, boolean, string]>([
    [{ job_type: 'internship' }, true, 'internship'],
    [{ job_type: 'apprenticeship' }, true, 'internship'],
    [{ min_experience_years: 0 }, true, 'min_experience_under_limit'],
    [{ min_experience_years: 0.5 }, true, 'min_experience_under_limit'],
    [{ min_experience_years: 1 }, false, 'min_experience_over_limit'],
    [{ min_experience_years: 3, invites_freshers: true }, false, 'min_experience_over_limit'],
    [{ invites_freshers: true }, true, 'invites_freshers'],
    [{}, false, 'unclear'],
    [{ genuine: 'walk_in', job_type: 'internship' }, false, 'not_genuine'],
    [{ in_india: false, job_type: 'internship' }, false, 'not_india'],
    [{ job_type: 'other', invites_freshers: true }, false, 'job_type_other'],
  ])('%j → shown %s (%s)', (t, shown, reason) => {
    expect(decide({ tags: tags(t) }, 1)).toEqual({ shown, reason });
  });

  it('lets the admin hide or block before anything else', () => {
    expect(decide({ tags: tags({ job_type: 'internship' }), hidden: true }, 1).reason).toBe('hidden');
    expect(decide({ tags: tags({ job_type: 'internship' }), blocked: true }, 1).reason).toBe('blocked');
    expect(decide({}, 1).reason).toBe('untagged');
  });

  it('never shows Adzuna text as the reason, only the deciding fact', () => {
    const t = tags({ job_type: 'internship', evidence: 'copied from the ad' });
    expect(whyText(t, { shown: true, reason: 'internship' }, true)).toBe('internship');
    expect(whyText(t, { shown: true, reason: 'internship' }, false)).toBe('copied from the ad');
  });
});

const row = (r: Partial<Row>): Row => ({
  key: 'k',
  title: 'Data Analyst',
  company: 'Acme',
  companyKey: 'acme',
  role: 'data_analytics_ai',
  cities: ['pune'],
  cityLinks: [],
  locationText: 'Pune',
  remote: false,
  jobType: 'full_time',
  firstSeen: '2026-11-20',
  source: 'greenhouse',
  aggregator: false,
  url: 'https://x.test/1',
  why: '',
  isNew: false,
  overridden: false,
  memberKeys: [],
  ...r,
});

describe('dedupe', () => {
  it('joins one opening in two cities of the same source into one card with a link per city', () => {
    const r = dedupe([row({ key: 'a', cities: ['pune'], url: 'https://x.test/a' }), row({ key: 'b', cities: ['mumbai'], url: 'https://x.test/b' })]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.cities.sort()).toEqual(['mumbai', 'pune']);
    expect(r.rows[0]!.cityLinks).toHaveLength(2);
    expect(r.removed).toBe(1);
  });

  it('drops the Adzuna copy of a company-board post in the same city', () => {
    const r = dedupe([row({ key: 'gh' }), row({ key: 'adzuna:1', source: 'adzuna', aggregator: true })]);
    expect(r.rows.map((x) => x.key)).toEqual(['gh']);
    expect(r.pairs).toEqual([['gh', 'adzuna:1']]);
  });

  it('keeps two different titles, and the same title in different cities across sources', () => {
    const r = dedupe([row({ key: 'a' }), row({ key: 'b', title: 'Data Engineer' }), row({ key: 'adzuna:2', source: 'adzuna', aggregator: true, cities: ['delhi'] })]);
    expect(r.rows).toHaveLength(3);
  });
});
