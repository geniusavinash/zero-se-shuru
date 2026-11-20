/** Text helpers: HTML to text, contact stripping, matching keys. */
import { createHash } from 'node:crypto';
import * as he from 'he';

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** HTML, possibly entity-escaped twice (as Greenhouse sends it), to readable plain text. */
export function htmlToText(html: string): string {
  let s = html;
  for (let i = 0; i < 2 && /&(lt|gt|amp|quot|#\d+);/.test(s); i++) s = he.decode(s);
  s = s
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/ul|\/ol)\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ');
  s = he.decode(s);
  return s
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/**
 * Phone numbers: Indian mobiles (optional +91 or 0), numbers that start with "+", and 1800 numbers.
 * A number range ("300000 - 450000", "3-5 years") is never touched: the patterns need one exact shape.
 */
const PHONES = [
  /(?<![\d.-])(?:\+91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?![\d-])/g,
  /(?<![\w+])\+\d{1,3}[\s-]?\d{2,5}[\s-]?\d{3,5}[\s-]?\d{0,5}(?![\d-])/g,
  /\b1800[\s-]?\d{3}[\s-]?\d{4}\b/g,
];

export function stripContacts(text: string): string {
  let s = text.replace(EMAIL, '[email removed]');
  for (const p of PHONES) s = s.replace(p, '[phone removed]');
  return s;
}

/** Lowercase, accents removed, punctuation to single spaces. Keeps + and # (C++, C#). */
export function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim();
}

const LEGAL_WORDS = new Set(['pvt', 'private', 'ltd', 'limited', 'inc', 'llc', 'llp', 'corp', 'corporation', 'co', 'plc', 'gmbh', 'the', 'india']);

/** "Razorpay Software Private Limited" and "Razorpay" give the same key: "razorpaysoftware" vs "razorpay" differ on purpose. */
export function companyKey(name: string): string {
  return fold(name)
    .split(' ')
    .filter((w) => w !== '' && !LEGAL_WORDS.has(w))
    .join('');
}

/** Title for matching duplicates: brackets (requisition codes, places) removed, folded. */
export function titleKey(title: string): string {
  return fold(title.replace(/[([][^)\]]*[)\]]/g, ' '));
}

/** Whole-word phrase test on folded text. */
export function hasPhrase(foldedText: string, phrase: string): boolean {
  const p = fold(phrase);
  return p !== '' && ` ${foldedText} `.includes(` ${p} `);
}

export function titleCase(token: string): string {
  return token.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
