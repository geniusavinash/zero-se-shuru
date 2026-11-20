/**
 * Saves one real answer per board source as a test fixture, with every email and phone number removed.
 * Run: npx tsx src/tools/record-fixtures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { userAgent } from '../agent.ts';
import { loadConfig } from '../config.ts';
import { loadEnv } from '../env.ts';
import { createHttp } from '../http.ts';
import { ashbyUrl } from '../sources/ashby.ts';
import { greenhouseUrl } from '../sources/greenhouse.ts';
import { leverUrl } from '../sources/lever.ts';
import { stripContacts } from '../text.ts';

function scrub(v: unknown): unknown {
  if (typeof v === 'string') return stripContacts(v);
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)]));
  return v;
}

loadEnv();
const cfg = loadConfig();
const http = createHttp({ userAgent: userAgent(cfg) });
const targets = [
  { ats: 'greenhouse', token: 'groww', url: greenhouseUrl('groww') },
  { ats: 'lever', token: 'cred', url: leverUrl('cred', 0) },
  { ats: 'ashby', token: 'atlan', url: ashbyUrl('atlan') },
];
for (const t of targets) {
  const r = await http.getJson(t.url);
  if (!r.ok) {
    console.log(`${t.ats}:${t.token}: FAILED ${r.reason}`);
    continue;
  }
  mkdirSync(`tests/fixtures/${t.ats}`, { recursive: true });
  const path = `tests/fixtures/${t.ats}/${t.token}.json`;
  writeFileSync(path, `${JSON.stringify(scrub(r.data), null, 1)}\n`);
  console.log(`${t.ats}:${t.token}: saved ${path}`);
}
