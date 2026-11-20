import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadOverrides } from '../src/overrides.ts';

// Review fix, round 3: when Supabase is configured but does not answer, the moderation state is unknown,
// so the run must not publish (it would bring back posts the admin hid).
describe('admin overrides', () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY };
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.SUPABASE_URL = saved.url ?? '';
    process.env.SUPABASE_PUBLISHABLE_KEY = saved.key ?? '';
  });

  it('marks the run as failed when a table cannot be read', async () => {
    process.env.SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    const o = await loadOverrides();
    expect(o.failed).toBe(true);
    expect(o.hidden.size).toBe(0);
  });

  it('is not a failure when Supabase is simply not configured (local runs)', async () => {
    process.env.SUPABASE_URL = '';
    process.env.SUPABASE_PUBLISHABLE_KEY = '';
    const o = await loadOverrides();
    expect(o.failed).toBeUndefined();
  });

  it('reads hidden posts, blocked companies, tag fixes and board switches', async () => {
    process.env.SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    const rows: Record<string, unknown[]> = {
      hidden_posts: [{ job_key: 'lever:a:1' }],
      blocked_companies: [{ company_key: 'acme' }],
      tag_fixes: [{ job_key: 'lever:a:2', role: 'marketing', cities: ['pune'] }],
      board_switches: [{ ats: 'lever', token: 'a', is_on: false }],
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(rows[new URL(url).pathname.split('/').pop() ?? ''] ?? []), { status: 200 })));
    const o = await loadOverrides();
    expect(o.failed).toBeUndefined();
    expect([...o.hidden]).toEqual(['lever:a:1']);
    expect([...o.blocked]).toEqual(['acme']);
    expect(o.tagFixes.get('lever:a:2')).toEqual({ role: 'marketing', cities: ['pune'] });
    expect(o.boardSwitches.get('lever:a')).toBe(false);
  });
});
