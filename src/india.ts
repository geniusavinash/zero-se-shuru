/**
 * The India rule: from a post's location strings, its country field and its workplace field, decide
 * whether it is in India, which listed cities it names, and whether it is remote within India.
 * Only location fields are read, never the description. City ids and aliases come from taxonomy.yaml.
 *
 * Settled readings (from v1's review against 40,049 real rows, kept on purpose):
 * - A location string is split into places at ; | / & + and the words "or"/"and"; commas stay inside
 *   one place ("Hosur, Tamil Nadu, India"). Each place is judged on its own, so an office abroad
 *   ("Hyderabad; Austin, TX") never hides an Indian one.
 * - A foreign marker (another country, a US state, ", XX" as a US state code) in a place cancels it,
 *   unless the place also says India. ", IN" is neutral: "Delhi, IN" is India, "Indianapolis, IN" is not.
 * - Context aliases (Saket, OMR, Salt Lake...) and NCR/Punjab/Salem count only beside another Indian signal.
 * - "Remote" counts as remote India only in an Indian place, or with no country at all.
 */
import type { TaxonomyConfig } from './config.ts';
import { fold } from './text.ts';
import type { LocationResult } from './types.ts';

type Kind = 'india' | 'city' | 'context' | 'needs' | 'state' | 'foreign' | 'remote' | 'pan';

interface Entry {
  kind: Kind;
  words: string[];
  city?: string;
}

const PAN_INDIA = ['pan india', 'across india', 'all india', 'anywhere in india', 'multiple locations in india'];
const INDIA_COUNTRY = new Set(['in', 'ind', 'india']);
const SPLIT = /[;|/\\&+•·\n]|\s(?:or|and)\s/i;

export interface IndiaRule {
  (input: { locations: string[]; country?: string; workplace?: string }): LocationResult;
}

export function makeIndiaRule(tax: TaxonomyConfig): IndiaRule {
  const entries: Entry[] = [];
  const seen = new Set<string>();
  const add = (phrase: string, kind: Kind, city?: string): void => {
    const words = fold(phrase).split(' ').filter(Boolean);
    const id = words.join(' ');
    if (words.length === 0 || seen.has(id)) return;
    seen.add(id);
    entries.push({ kind, words, city });
  };
  add('india', 'india');
  for (const p of PAN_INDIA) add(p, 'pan');
  const needs = new Set(tax.needs_india_context.map(fold));
  for (const c of [...tax.cities, ...tax.special_cities]) {
    if (c.id === 'other_india') continue;
    for (const a of [c.name, ...c.aliases]) add(a, needs.has(fold(a)) ? 'needs' : 'city', c.id);
    for (const a of c.context_aliases ?? []) add(a, 'context', c.id);
  }
  for (const s of tax.states) add(s, needs.has(fold(s)) ? 'needs' : 'state');
  for (const n of tax.needs_india_context) add(n, 'needs');
  for (const c of tax.foreign_markers.countries) add(c, 'foreign');
  for (const s of tax.foreign_markers.us_states) add(s, 'foreign');
  for (const o of tax.foreign_markers.other) add(o, 'foreign');
  for (const r of tax.remote_aliases) add(r, 'remote');
  entries.sort((a, b) => b.words.length - a.words.length);
  const usCodes = new Set(tax.foreign_markers.us_state_codes.map((c) => c.toUpperCase()).filter((c) => c !== 'IN'));
  const ncrCities = new Set(tax.metro_groups.find((g) => g.cities.includes('delhi_ncr'))?.cities.filter((c) => c !== 'delhi_ncr') ?? []);

  function readPlace(raw: string): { india: boolean; foreign: boolean; cities: string[]; remote: boolean; pan: boolean } {
    const words = fold(raw).split(' ').filter(Boolean);
    const used = new Array<boolean>(words.length).fill(false);
    const found: Entry[] = [];
    for (const e of entries) {
      for (let i = 0; i + e.words.length <= words.length; i++) {
        if (used.slice(i, i + e.words.length).some(Boolean)) continue;
        if (e.words.every((w, k) => words[i + k] === w)) {
          found.push(e);
          used.fill(true, i, i + e.words.length);
        }
      }
    }
    const code = [...raw.matchAll(/,\s*([A-Z]{2})\b/g)].some((m) => usCodes.has(m[1] ?? ''));
    const has = (k: Kind): boolean => found.some((e) => e.kind === k);
    const foreign = has('foreign') || code;
    const anchored = has('india') || has('state') || has('city');
    // "Pan India" is matched as one phrase, so it carries the India signal itself (review fix).
    const india = has('india') || has('pan') || (!foreign && anchored);
    const cities: string[] = [];
    if (india) {
      for (const e of found) {
        if ((e.kind === 'city' || e.kind === 'context' || (e.kind === 'needs' && e.city)) && e.city && !cities.includes(e.city)) cities.push(e.city);
      }
    }
    return { india, foreign, cities, remote: has('remote') && (india || !foreign), pan: has('pan') };
  }

  return ({ locations, country, workplace }) => {
    const countryFolded = fold(country ?? '');
    const countryIndia = INDIA_COUNTRY.has(countryFolded) || countryFolded.split(' ').includes('india');
    const countryForeign = countryFolded !== '' && !countryIndia;
    let isIndia = false;
    let remote = false;
    const cities: string[] = [];
    const places = locations.flatMap((l) => l.split(SPLIT)).map((p) => p.trim()).filter(Boolean);
    for (const [i, place] of places.entries()) {
      const r = readPlace(place);
      // A foreign country field cancels a bare city name in the first place ("Hyderabad" with country PK).
      const india = r.india && !(countryForeign && i === 0 && !fold(place).split(' ').includes('india'));
      if (india) {
        isIndia = true;
        for (const c of r.cities) if (!cities.includes(c)) cities.push(c);
      }
      if (r.remote && (india || (!r.foreign && !countryForeign))) remote = true;
    }
    if (!isIndia && countryIndia && !places.some((p) => readPlace(p).foreign)) isIndia = true;
    if (!isIndia) return { isIndia: false, cities: [], remote: false };
    if (fold(workplace ?? '') === 'remote') remote = true;
    const named = cities.some((c) => ncrCities.has(c)) ? cities.filter((c) => c !== 'delhi_ncr') : cities;
    return { isIndia: true, cities: named, remote };
  };
}
