/**
 * Writes made-up sample data to site/samples/ for front-end work (docs/FRONTEND_CONTRACT.md).
 * Every company is "Sample ..." so nobody mistakes it for real data. Roles and cities come from config.
 * Run: npx tsx src/tools/make-samples.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../config.ts';
import type { Row } from '../types.ts';

const cfg = loadConfig();
const today = '2026-11-20';
const iso = (d: string): string => `${d}T05:30:00Z`;

const base = { overridden: false, memberKeys: [] as string[], cityLinks: [] as Row['cityLinks'] };
const rows: Row[] = [
  { ...base, key: 'greenhouse:samplelabs:1001', title: 'Software Engineer Intern (2026 batch)', company: 'Sample Labs', companyKey: 'samplelabs', role: 'software_development', cities: ['bengaluru'], locationText: 'Bengaluru, Karnataka, India', remote: false, jobType: 'internship', postedAt: iso('2026-11-18'), firstSeen: '2026-11-18', source: 'greenhouse', aggregator: false, url: 'https://example.com/jobs/1001', why: 'final-year students and freshers can apply', isNew: false },
  { ...base, key: 'lever:samplepay:a1', title: 'Data Analyst - Freshers', company: 'Sample Pay', companyKey: 'samplepay', role: 'data_analytics_ai', cities: ['noida', 'gurugram'], cityLinks: [{ city: 'noida', url: 'https://example.com/jobs/a1' }, { city: 'gurugram', url: 'https://example.com/jobs/a2' }], locationText: 'Noida / Gurugram', remote: false, jobType: 'full_time', postedAt: iso(today), firstSeen: today, source: 'lever', aggregator: false, url: 'https://example.com/jobs/a1', why: '0-1 years of experience', isNew: true, memberKeys: ['lever:samplepay:a2'] },
  { ...base, key: 'ashby:sampleai:x9', title: 'Graduate Trainee - Operations', company: 'Sample AI', companyKey: 'sampleai', role: 'operations_admin', cities: [], locationText: 'Remote - India', remote: true, jobType: 'full_time', postedAt: iso('2026-11-10'), firstSeen: '2026-11-12', source: 'ashby', aggregator: false, url: 'https://example.com/jobs/x9', why: 'graduate trainee programme for 2025 and 2026 graduates', isNew: false },
  { ...base, key: 'adzuna:3f9c0a1b2c3d4e5f', title: 'Marketing Intern', company: 'Sample Brands Pvt Ltd', companyKey: 'samplebrands', role: 'marketing', cities: ['pune'], locationText: 'Pune, Maharashtra', remote: false, jobType: 'internship', postedAt: iso('2026-11-19'), firstSeen: '2026-11-19', source: 'adzuna', aggregator: true, url: 'https://example.com/adzuna/3f9c', why: 'internship', isNew: false },
  { ...base, key: 'greenhouse:samplecloud:2002', title: 'Associate Cloud Engineer', company: 'Sample Cloud', companyKey: 'samplecloud', role: 'it_cloud_security', cities: ['hyderabad'], locationText: 'Hyderabad, India', remote: false, jobType: 'full_time', firstSeen: '2026-11-15', source: 'greenhouse', aggregator: false, url: 'https://example.com/jobs/2002', why: 'freshers with a CS degree are welcome', isNew: false },
  { ...base, key: 'adzuna:7a7a7a7a7a7a7a7a', title: 'Customer Support Executive (Freshers)', company: 'Sample Care', companyKey: 'samplecare', role: 'customer_support', cities: ['chennai'], locationText: 'Chennai, Tamil Nadu', remote: false, jobType: 'full_time', postedAt: iso('2026-11-17'), firstSeen: '2026-11-17', source: 'adzuna', aggregator: true, url: 'https://example.com/adzuna/7a7a', why: 'invites freshers', isNew: false, overridden: true },
  { ...base, key: 'lever:samplefin:f3', title: 'Accounts Apprentice', company: 'Sample Finance', companyKey: 'samplefinance', role: 'finance_accounting', cities: ['other_india'], locationText: 'Rourkela, Odisha', remote: false, jobType: 'apprenticeship', postedAt: iso('2026-11-05'), firstSeen: '2026-11-06', source: 'lever', aggregator: false, url: 'https://example.com/jobs/f3', why: 'apprenticeship under the NATS scheme', isNew: false },
  { ...base, key: 'greenhouse:samplelabs:1003', title: 'UI/UX Design Intern', company: 'Sample Labs', companyKey: 'samplelabs', role: 'design_creative', cities: ['mumbai'], locationText: 'Mumbai, India', remote: false, jobType: 'internship', postedAt: iso('2026-11-19'), firstSeen: '2026-11-19', source: 'greenhouse', aggregator: false, url: 'https://example.com/jobs/1003', why: 'students in their final year', isNew: false },
];

const funnelRow = { read: 0, india: 0, candidates: 0, tagged: 0, eligible: 0, afterDedupe: 0, shown: 0 };
const meta = {
  site: { name: cfg.site.name, tagline: cfg.site.tagline, publicUrl: cfg.site.public_url, repoUrl: 'https://github.com/example/zero-se-shuru', panels: true, contact: 'removals@example.com', staleAfterHours: cfg.site.stale_after_hours },
  generatedAt: '2026-11-20T01:37:00Z',
  runId: '2026-11-20T01-07-00Z-schedule',
  trigger: 'schedule',
  counts: { shown: rows.length, companies: new Set(rows.map((r) => r.companyKey)).size, newToday: rows.filter((r) => r.isNew).length, duplicatesRemoved: 3, cityMismatch: 2 },
  funnel: {
    total: { read: 9800, india: 5400, candidates: 1900, tagged: 1890, eligible: 260, afterDedupe: 241, shown: rows.length },
    bySource: { greenhouse: { ...funnelRow, read: 6000, shown: 3 }, lever: { ...funnelRow, read: 2500, shown: 2 }, ashby: { ...funnelRow, read: 700, shown: 1 }, adzuna: { ...funnelRow, read: 600, shown: 2 } },
  },
  sources: [
    { name: 'greenhouse', display: 'Greenhouse job boards', docs: 'https://developers.greenhouse.io/job-board.html', terms: 'https://developers.greenhouse.io/job-board.html', whyAllowed: 'Documented public endpoint for published jobs.', attribution: 'none required', boardsOk: 110, boardsFailed: 3, on: true },
    { name: 'adzuna', display: 'Adzuna', docs: 'https://developer.adzuna.com/overview', terms: 'https://developer.adzuna.com/docs/terms_of_service', whyAllowed: 'Official API used under its terms, with its label on every listing.', attribution: 'Jobs by Adzuna', boardsOk: 1, boardsFailed: 0, on: true },
  ],
  boards: [
    { ats: 'greenhouse', token: 'samplelabs', company: 'Sample Labs', on: true, ok: true, india: 40, candidates: 12, shown: 2 },
    { ats: 'lever', token: 'samplepay', company: 'Sample Pay', on: true, ok: false, reason: 'HTTP 404', india: 0, candidates: 0, shown: 0 },
  ],
  metrics: {
    asOfRun: '2026-11-20T10-30-00Z-local', model: 'gpt-6-luna', promptVersion: 'v1',
    accuracy: { both: { correct: 44, total: 50, low: 0.76, high: 0.95 }, role: { correct: 47, total: 50, low: 0.84, high: 0.98 }, city: { correct: 46, total: 50, low: 0.81, high: 0.97 } },
    fresherShareBySource: { greenhouse: { correct: 18, total: 19, low: 0.75, high: 0.99 }, adzuna: { correct: 25, total: 31, low: 0.63, high: 0.91 } },
    costPer1000Tagged: 0.06, costPer1000Shown: 0.47,
  },
  runs: [
    { id: '2026-11-20T01-07-00Z-schedule', startedAt: '2026-11-20T01:07:00Z', trigger: 'schedule', ok: true, shown: rows.length, newPosts: 1, llmCalls: 41, costUsd: 0.002 },
    { id: '2026-11-19T13-37-00Z-schedule', startedAt: '2026-11-19T13:37:00Z', trigger: 'schedule', ok: false, shown: 0, newPosts: 0, llmCalls: 0, costUsd: 0, blockedReason: 'fewer than 150 posts would be shown' },
  ],
  roles: cfg.taxonomy.roles.map((r) => ({ id: r.id, name: r.name })),
  cities: [...cfg.taxonomy.cities, ...cfg.taxonomy.special_cities].map((c) => ({ id: c.id, name: c.name, aliases: c.aliases })),
  metroGroups: cfg.taxonomy.metro_groups,
};

const review = [
  { key: 'lever:samplepay:a1', title: 'Data Analyst - Freshers', company: 'Sample Pay', source: 'lever', url: 'https://example.com/jobs/a1', reason: 'city_mismatch', role: 'data_analytics_ai', llmCities: ['noida'], ruleCities: ['noida', 'gurugram'] },
  { key: 'greenhouse:samplecloud:2003', title: 'Cloud Support Intern', company: 'Sample Cloud', source: 'greenhouse', url: 'https://example.com/jobs/2003', reason: 'untagged', llmCities: [], ruleCities: ['hyderabad'] },
];

mkdirSync('site/samples', { recursive: true });
writeFileSync('site/samples/jobs.json', `${JSON.stringify(rows, null, 2)}\n`);
writeFileSync('site/samples/meta.json', `${JSON.stringify(meta, null, 2)}\n`);
writeFileSync('site/samples/review.json', `${JSON.stringify(review, null, 2)}\n`);
console.log(`site/samples: ${rows.length} rows, ${meta.roles.length} roles, ${meta.cities.length} cities, ${review.length} review items`);
