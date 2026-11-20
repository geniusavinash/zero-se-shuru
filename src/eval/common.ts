/** Shared pieces of the 50-post hand-check: the CSV format, the Wilson interval, city-name mapping. */
import { readFileSync } from 'node:fs';
import type { TaxonomyConfig } from '../config.ts';
import { fold } from '../text.ts';

export const PRIVATE_LABELS = 'eval/private_labels.csv';
export const LABELS = 'eval/labels_50.csv';
export const SAMPLE = 'eval/sample_50.json';
export const PREDICTIONS = 'eval/pred_50.json';

/** CSV-quoted, and a value that a spreadsheet would read as a formula is made plain text (review fix). */
export function csvCell(v: string): string {
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cell = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries((head ?? []).map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export function readCsv(path: string): Record<string, string>[] {
  return parseCsv(readFileSync(path, 'utf8').replace(/^﻿/, ''));
}

/** Wilson score interval at 95%. */
export function wilson(correct: number, total: number): { low: number; high: number } {
  if (total === 0) return { low: 0, high: 0 };
  const z = 1.96;
  const p = correct / total;
  const denom = 1 + (z * z) / total;
  const centre = (p + (z * z) / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denom;
  return { low: Math.max(0, Number((centre - half).toFixed(3))), high: Math.min(1, Number((centre + half).toFixed(3))) };
}

/** "Bangalore; Gurgaon" → ["bengaluru", "gurugram"]. Unknown names are kept as written (they count as wrong). */
export function cityIds(text: string, tax: TaxonomyConfig): string[] {
  const byName = new Map<string, string>();
  for (const c of [...tax.cities, ...tax.special_cities]) {
    for (const n of [c.id, c.name, ...c.aliases]) byName.set(fold(n), c.id);
  }
  const out: string[] = [];
  for (const part of text.split(/[;|/]/)) {
    const f = fold(part);
    if (f === '' || f === 'none' || f === 'remote') continue;
    const id = byName.get(f) ?? byName.get(f.replaceAll(' ', '_')) ?? f.replaceAll(' ', '_');
    if (!out.includes(id)) out.push(id);
  }
  return out.sort();
}
