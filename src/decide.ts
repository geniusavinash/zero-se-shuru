/**
 * Step 5: shown or not, decided in code from the LLM's facts (ARCHITECTURE §8). The first rule that
 * applies wins and becomes the stored reason. No LLM call happens here, so changing the fresher rule
 * (experience_limit_years in config/rules.yaml) needs no new call.
 */
import type { Decision, Tags } from './types.ts';

export function decide(
  input: { tags?: Tags; hidden?: boolean; blocked?: boolean; scamCompany?: boolean },
  experienceLimitYears: number,
): Decision {
  if (input.hidden) return { shown: false, reason: 'hidden' };
  if (input.blocked) return { shown: false, reason: 'blocked' };
  const t = input.tags;
  if (!t) return { shown: false, reason: 'untagged' };
  if (t.genuine !== 'ok') return { shown: false, reason: 'not_genuine' };
  // Another post from the same employer in this run looked like a fee or scam ad. Found in tuning
  // (2026-11-20): two "airport ground staff, freshers" ads were flagged and a third from the same
  // employer was shown. Freshers are the usual target of such ads, so the whole employer is held back.
  if (input.scamCompany) return { shown: false, reason: 'scam_company' };
  if (!t.in_india) return { shown: false, reason: 'not_india' };
  if (t.job_type === 'other') return { shown: false, reason: 'job_type_other' };
  if (t.job_type === 'internship' || t.job_type === 'apprenticeship') return { shown: true, reason: 'internship' };
  const years = typeof t.min_experience_years === 'number' && t.min_experience_years >= 0 ? t.min_experience_years : null;
  if (years !== null) {
    return years < experienceLimitYears ? { shown: true, reason: 'min_experience_under_limit' } : { shown: false, reason: 'min_experience_over_limit' };
  }
  if (t.invites_freshers) return { shown: true, reason: 'invites_freshers' };
  return { shown: false, reason: 'unclear' };
}

/** "Why it's here" on the card: the evidence phrase for company posts, the deciding fact otherwise. */
export function whyText(tags: Tags, d: Decision, aggregator: boolean): string {
  if (!aggregator) {
    const words = tags.evidence.split(/\s+/).filter(Boolean);
    if (words.length > 0) return words.slice(0, 15).join(' ');
  }
  switch (d.reason) {
    case 'internship':
      return tags.job_type === 'apprenticeship' ? 'apprenticeship' : 'internship';
    case 'min_experience_under_limit': {
      const y = tags.min_experience_years ?? 0;
      return y === 0 ? 'asks for 0 years of experience' : `asks for ${Math.round(y * 12)} months of experience`;
    }
    case 'invites_freshers':
      return 'invites freshers';
    default:
      return '';
  }
}
