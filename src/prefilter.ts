/**
 * Cheap rules before the LLM. They only drop a post or let it through; the decision to show is made
 * later in src/decide.ts from the LLM's facts. All matching is on whole words of the folded title.
 */
import type { RulesConfig } from './config.ts';
import { fold, hasPhrase } from './text.ts';
import type { Job } from './types.ts';

export type TitleCall = 'junk' | 'drop' | 'keep' | 'ask';

const YEARS = /(\d+(?:\.\d+)?)\s*(?:\+|plus)\s*(?:years?|yrs?)\b|(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*\d+(?:\.\d+)?\s*(?:years?|yrs?)\b/i;

/** keep: an entry-level title. ask: let the LLM decide. drop: senior. junk: not a real opening. */
export function titleCall(title: string, rules: RulesConfig): { call: TitleCall; word?: string } {
  const t = rules.title;
  const folded = fold(title);
  const junk = t.junk_phrases.find((p) => hasPhrase(folded, p));
  if (junk) return { call: 'junk', word: junk };

  const entry = t.entry_words.find((w) => hasPhrase(folded, w));
  let withoutNeutral = ` ${folded} `;
  for (const p of t.neutral_phrases) withoutNeutral = withoutNeutral.replaceAll(` ${fold(p)} `, ' ');
  const dropWord = t.drop_words.find((w) => hasPhrase(withoutNeutral.trim(), w));
  const m = YEARS.exec(title);
  const years = m ? Number(m[1] ?? m[2]) : undefined;
  const yearsDrop = years !== undefined && years >= t.min_years_in_title_to_drop ? `${years}+ years` : undefined;
  const hard = dropWord ?? yearsDrop;

  if (hard) return entry ? { call: 'ask', word: `${hard} + ${entry}` } : { call: 'drop', word: hard };
  if (entry) return { call: 'keep', word: entry };
  return { call: 'ask' };
}

/** True when the post is older than the limit. A post with no date is kept. */
export function tooOld(job: Pick<Job, 'postedAt'>, maxAgeDays: number, now: Date): boolean {
  if (!job.postedAt) return false;
  return now.getTime() - Date.parse(job.postedAt) > maxAgeDays * 86_400_000;
}

/** At most `cap` candidates per company: entry-level titles first, then the newest. */
export function capPerCompany<T extends { job: Job; call: TitleCall }>(items: T[], cap: number): T[] {
  const byCompany = new Map<string, T[]>();
  for (const it of items) {
    const k = fold(it.job.company);
    const list = byCompany.get(k);
    if (list) list.push(it);
    else byCompany.set(k, [it]);
  }
  const out: T[] = [];
  for (const list of byCompany.values()) {
    list.sort((a, b) => {
      if ((a.call === 'keep') !== (b.call === 'keep')) return a.call === 'keep' ? -1 : 1;
      return (b.job.postedAt ?? '').localeCompare(a.job.postedAt ?? '');
    });
    out.push(...list.slice(0, cap));
  }
  return out;
}
