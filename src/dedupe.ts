/**
 * Step 6: duplicates (ARCHITECTURE §8). Precision over recall: a missed duplicate costs one extra card,
 * a wrong merge hides a real opening. Keys must match exactly; nothing is fuzzy.
 *  1. Same key → one row.
 *  2. Same source, company key, title key and job type → one card; cities joined, each city keeps its link.
 *  3. The same across sources with a shared city (or neither naming one) → the company-board card wins
 *     and the Adzuna row is dropped.
 */
import { titleKey } from './text.ts';
import type { Row } from './types.ts';

export interface DedupeResult {
  rows: Row[];
  removed: number;
  /** [kept, dropped] keys, for the funnel and the sheet. */
  pairs: [string, string][];
}

const openingKey = (r: Row): string => [r.companyKey, titleKey(r.title), r.jobType].join('|');

export function dedupe(input: Row[]): DedupeResult {
  const byKey = new Map<string, Row>();
  for (const r of input) if (!byKey.has(r.key)) byKey.set(r.key, r);
  let removed = input.length - byKey.size;
  const pairs: [string, string][] = [];

  const groups = new Map<string, Row[]>();
  for (const r of byKey.values()) {
    const k = `${r.source}|${openingKey(r)}`;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const merged: Row[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => (b.postedAt ?? b.firstSeen).localeCompare(a.postedAt ?? a.firstSeen) || a.key.localeCompare(b.key));
    const lead = g[0]!;
    if (g.length === 1) {
      merged.push(lead);
      continue;
    }
    const cities: string[] = [];
    const cityLinks: Row['cityLinks'] = [];
    for (const m of g) {
      for (const c of m.cities) {
        if (cities.includes(c)) continue;
        cities.push(c);
        cityLinks.push({ city: c, url: m.url });
      }
    }
    for (const m of g.slice(1)) pairs.push([lead.key, m.key]);
    removed += g.length - 1;
    merged.push({
      ...lead,
      cities,
      cityLinks,
      remote: g.some((m) => m.remote),
      isNew: g.every((m) => m.isNew),
      firstSeen: g.map((m) => m.firstSeen).sort()[0] ?? lead.firstSeen,
      memberKeys: [...new Set([...lead.memberKeys, ...g.slice(1).flatMap((m) => [m.key, ...m.memberKeys])])],
      locationText: [...new Set(g.map((m) => m.locationText))].join(' | '),
    });
  }

  const direct = new Map<string, Row[]>();
  for (const r of merged) {
    if (r.aggregator) continue;
    const k = openingKey(r);
    const list = direct.get(k);
    if (list) list.push(r);
    else direct.set(k, [r]);
  }
  const out: Row[] = [];
  for (const r of merged) {
    if (r.aggregator) {
      const hit = (direct.get(openingKey(r)) ?? []).find(
        (d) => (d.cities.length === 0 && r.cities.length === 0) || d.cities.some((c) => r.cities.includes(c)),
      );
      if (hit) {
        removed++;
        pairs.push([hit.key, r.key]);
        // The dropped row's keys stay reachable through the card (saved jobs, moderation, sampling).
        hit.memberKeys = [...new Set([...hit.memberKeys, r.key, ...r.memberKeys])];
        continue;
      }
    }
    out.push(r);
  }
  return { rows: out, removed, pairs };
}
