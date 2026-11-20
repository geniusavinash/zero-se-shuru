/**
 * The admin's changes, read from Supabase over REST with the publishable key (these tables are public
 * read, admin write). If Supabase is not configured or does not answer, the run goes on without them.
 */
import { optionalEnv } from './env.ts';

export interface Overrides {
  hidden: Set<string>;
  blocked: Set<string>;
  tagFixes: Map<string, { role?: string; cities?: string[] }>;
  boardSwitches: Map<string, boolean>;
  note?: string;
}

const empty = (note?: string): Overrides => ({ hidden: new Set(), blocked: new Set(), tagFixes: new Map(), boardSwitches: new Map(), note });

export async function loadOverrides(): Promise<Overrides> {
  const url = optionalEnv('SUPABASE_URL');
  const key = optionalEnv('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !key) return empty('Supabase not configured: no admin overrides applied');
  const get = async (table: string, select: string): Promise<Record<string, unknown>[]> => {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}?select=${select}&limit=10000`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>[];
  };
  try {
    const [hidden, blocked, fixes, switches] = await Promise.all([
      get('hidden_posts', 'job_key'),
      get('blocked_companies', 'company_key'),
      get('tag_fixes', 'job_key,role,cities'),
      get('board_switches', 'ats,token,is_on'),
    ]);
    return {
      hidden: new Set(hidden.map((r) => String(r.job_key))),
      blocked: new Set(blocked.map((r) => String(r.company_key))),
      tagFixes: new Map(
        fixes.map((r) => [String(r.job_key), { role: typeof r.role === 'string' ? r.role : undefined, cities: Array.isArray(r.cities) ? (r.cities as string[]) : undefined }]),
      ),
      boardSwitches: new Map(switches.map((r) => [`${String(r.ats)}:${String(r.token)}`, r.is_on === true])),
    };
  } catch (err) {
    return empty(`Supabase overrides not read (${err instanceof Error ? err.message : 'error'}); run continues without them`);
  }
}
