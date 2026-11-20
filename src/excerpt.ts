/**
 * What the LLM reads of a description: at most `max` characters, in three tiers.
 *  1. Who may apply: freshers, students, graduates, a batch or graduation year, internships, entry level.
 *  2. Experience and qualification lines: years, degree, eligibility.
 *  3. The opening of the description, to fill what is left.
 * Found in tuning (2026-11-20): with one tier, company boilerplate that says "career experience" used up
 * the space before "2027 graduation" was reached, and a graduate programme was marked "unclear".
 */
const WHO = /(fresher|fresh graduate|recent graduate|college graduate|graduat(e|es|ing|ion)|students?\b|batch|class of|20(2[5-9]|30)\b|intern|apprentic|trainee|entry[- ]level|no prior|0\s*(-|to)\s*\d+\s*(years?|yrs))/i;
const EXPERIENCE = /(experience|years?|yrs|eligib|qualification|degree|b\.?\s?tech|b\.?e\b|mba|bca|mca|b\.?com|pass(ed)?[- ]?out)/i;

export function excerpt(description: string, max = 1500): string {
  // A very long piece (one paragraph with no sentence ends) is cut into ~300-character chunks at spaces,
  // so the eligibility words inside it can still be picked (review fix).
  const pieces = description
    .split(/\n+|(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 2)
    .flatMap((p) => (p.length <= 400 ? [p] : (p.match(/.{1,300}(?:\s|$)/g) ?? [p]).map((c) => c.trim())));
  const picked = new Set<string>();
  let used = 0;
  const take = (p: string): void => {
    if (picked.has(p) || used + p.length + 1 > max) return;
    picked.add(p);
    used += p.length + 1;
  };
  for (const p of pieces) if (WHO.test(p) && used < max * 0.5) take(p);
  for (const p of pieces) if (EXPERIENCE.test(p) && used < max * 0.75) take(p);
  for (const p of pieces) if (used < max) take(p);
  // Original order, so the model reads natural text. A sentence repeated in the description is emitted
  // once, so repeats can never push a picked sentence past the budget.
  const emitted = new Set<string>();
  return pieces
    .filter((p) => picked.has(p) && !emitted.has(p) && emitted.add(p))
    .join('\n')
    .slice(0, max);
}
