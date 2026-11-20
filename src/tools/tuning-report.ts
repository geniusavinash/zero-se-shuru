/** Summarises .cache/out/tuning.json: decisions, reasons, city disagreements, and the rows to eyeball. */
import { readFileSync } from 'node:fs';
import { loadConfig } from '../config.ts';
import { decide } from '../decide.ts';
import type { Tags } from '../types.ts';

const cfg = loadConfig();
const rows = JSON.parse(readFileSync('.cache/out/tuning.json', 'utf8')) as {
  key: string;
  title: string;
  company: string;
  locations: string[];
  rule: string[];
  tags: Tags | null;
}[];
const reasons: Record<string, number> = {};
const lines: string[] = [];
let mismatch = 0;
for (const r of rows) {
  const d = decide({ tags: r.tags ?? undefined }, cfg.rules.experience_limit_years);
  reasons[d.reason] = (reasons[d.reason] ?? 0) + 1;
  const t = r.tags;
  const cityDiff = t && r.rule.length > 0 && (t.cities.length !== r.rule.length || !t.cities.every((c) => r.rule.includes(c)));
  if (cityDiff) mismatch++;
  lines.push(
    `${d.shown ? 'SHOW' : '    '} ${d.reason.padEnd(26)} ${(t?.role ?? '-').padEnd(24)} ${(t?.job_type ?? '-').padEnd(10)} exp=${String(t?.min_experience_years ?? '-').padEnd(4)} fr=${t?.invites_freshers ? 'y' : 'n'} ${cityDiff ? `CITY llm=${t?.cities.join('/')} rule=${r.rule.join('/')}` : `cities=${t?.cities.join('/') ?? ''}`} | ${r.title.slice(0, 60)} @ ${r.company.slice(0, 20)}`,
  );
}
const shown = rows.filter((r) => decide({ tags: r.tags ?? undefined }, cfg.rules.experience_limit_years).shown).length;
console.log(`rows ${rows.length} · shown ${shown} (${((shown / rows.length) * 100).toFixed(0)}%) · city disagreements ${mismatch}`);
console.log(`reasons: ${JSON.stringify(reasons)}`);
const which = process.argv[2] ?? 'shown';
for (const l of lines) if (which === 'all' || (which === 'shown' && l.startsWith('SHOW')) || (which === 'city' && l.includes('CITY'))) console.log(l);
