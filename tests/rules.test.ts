import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { makeIndiaRule } from '../src/india.ts';
import { titleCall, tooOld } from '../src/prefilter.ts';
import { csvCell } from '../src/eval/common.ts';
import { excerpt } from '../src/excerpt.ts';
import { companyKey, htmlToText, stripContacts } from '../src/text.ts';

const cfg = loadConfig();
const india = makeIndiaRule(cfg.taxonomy);
const at = (locations: string[], country?: string, workplace?: string) => india({ locations, country, workplace });

describe('India rule', () => {
  it.each([
    [['Bengaluru, Karnataka, India'], ['bengaluru']],
    [['Gurgaon'], ['gurugram']],
    [['Navi Mumbai'], ['navi_mumbai']],
    [['Delhi, IN'], ['delhi']],
    [['Hyderabad; Austin, TX'], ['hyderabad']],
    [['Noida / Gurugram'], ['noida', 'gurugram']],
    [['Delhi NCR'], ['delhi_ncr']],
    [['Pune', 'Bangalore'], ['pune', 'bengaluru']],
  ])('%j is India with cities %j', (locations, cities) => {
    const r = at(locations);
    expect(r.isIndia).toBe(true);
    expect(r.cities).toEqual(cities);
  });

  it.each([[['Indianapolis, IN']], [['Remote - US']], [['Whitefield, NH']], [['Salem, OR']], [['London, United Kingdom']], [['Singapore']]])(
    '%j is not India',
    (locations) => expect(at(locations).isIndia).toBe(false),
  );

  it('reads the country field, and "Remote" with it as remote India', () => {
    expect(at(['Remote'], 'IN')).toEqual({ isIndia: true, cities: [], remote: true });
    expect(at(['Remote - India']).remote).toBe(true);
    expect(at(['Hyderabad'], 'PK').isIndia).toBe(false);
  });

  it('reads "Pan India" and "Anywhere in India" as India with no city', () => {
    expect(at(['Pan India'])).toEqual({ isIndia: true, cities: [], remote: false });
    expect(at(['Anywhere in India']).isIndia).toBe(true);
  });

  it('counts NCR only beside another Indian signal', () => {
    expect(at(['NCR']).isIndia).toBe(false);
    expect(at(['Gurugram, NCR, India']).cities).toEqual(['gurugram']);
  });
});

describe('title rule', () => {
  const call = (t: string) => titleCall(t, cfg.rules).call;
  it.each([
    ['Software Engineer Intern', 'keep'],
    ['Graduate Trainee - Operations', 'keep'],
    ['Senior Software Engineer', 'drop'],
    ['Sr. Data Analyst', 'drop'],
    ['Software Engineer II', 'drop'],
    ['Backend Engineer (3+ years)', 'drop'],
    ['Head of Internships', 'ask'],
    ['Associate Product Manager', 'ask'],
    ['Lead Generation Executive', 'ask'],
    ['Data Analyst', 'ask'],
    ['Engineer (0-2 years)', 'ask'],
    ['Talent Pool - Engineering', 'junk'],
    ['Walk-in Drive for Freshers', 'junk'],
  ])('%s → %s', (title, expected) => expect(call(title)).toBe(expected));

  it('drops a post older than the age limit but keeps one with no date', () => {
    const now = new Date('2026-11-20T00:00:00Z');
    expect(tooOld({ postedAt: '2026-08-01T00:00:00Z' }, 60, now)).toBe(true);
    expect(tooOld({ postedAt: '2026-11-01T00:00:00Z' }, 60, now)).toBe(false);
    expect(tooOld({}, 60, now)).toBe(false);
  });
});

describe('text helpers', () => {
  it('removes phone numbers and emails but never a number range', () => {
    const s = stripContacts('Call 9876543210 or mail hr@example.com. CTC 300000 - 450000. 3-5 years.');
    expect(s).not.toContain('9876543210');
    expect(s).not.toContain('hr@example.com');
    expect(s).toContain('300000 - 450000');
    expect(s).toContain('3-5 years');
  });

  it('decodes Greenhouse-style double-escaped HTML to plain text', () => {
    expect(htmlToText('&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;ul&gt;&lt;li&gt;One&lt;/li&gt;&lt;/ul&gt;')).toBe('Hello & welcome\n\n- One');
  });

  it('keeps the eligibility words of one long paragraph inside the excerpt budget', () => {
    const filler = 'We build software for banks and insurers across the world. '.repeat(40);
    const text = `${filler}This role is open to 2026 graduates and freshers with no prior experience. ${filler}`;
    const e = excerpt(text, 1500);
    expect(e.length).toBeGreaterThan(0);
    expect(e.length).toBeLessThanOrEqual(1500);
    expect(e).toContain('2026 graduates');
  });

  it('makes a spreadsheet formula plain text in CSV exports', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('Data Analyst')).toBe('Data Analyst');
  });

  it('gives one company key for name variants', () => {
    expect(companyKey('Razorpay Software Private Limited')).toBe(companyKey('Razorpay Software Pvt. Ltd.'));
  });
});
