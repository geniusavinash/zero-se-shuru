import { describe, expect, it } from 'vitest';
import { isPublicSupabaseKey, locationText } from '../src/build.ts';
import { loadConfig, parseBoards } from '../src/config.ts';

describe('config', () => {
  it('loads every config file without a schema error', () => {
    const cfg = loadConfig();
    expect(cfg.site.name).toBe('Zero Se Shuru');
    expect(cfg.model.provider).toBe('azure_openai');
    expect(cfg.taxonomy.roles).toHaveLength(17);
    expect(cfg.taxonomy.roles.map((r) => r.id)).toContain('other');
    expect(cfg.boards.length).toBeGreaterThanOrEqual(177);
  });

  it('starts the two huge, low-India boards switched off', () => {
    const off = loadConfig().boards.filter((b) => !b.on).map((b) => `${b.ats}:${b.token}`);
    expect(off).toEqual(expect.arrayContaining(['lever:tsmg', 'ashby:bjakcareer']));
  });

  it('rejects a boards file with a bad "on" value instead of guessing', () => {
    expect(() => parseBoards('ats,token,company,on\ngreenhouse,x,,maybe\n')).toThrow(/yes or no/);
  });
});

describe('public Supabase key guard (config.js is shipped to every visitor)', () => {
  const jwt = (payload: object): string =>
    ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.');
  it('accepts only a publishable key or an anon JWT', () => {
    expect(isPublicSupabaseKey('sb_publishable_abc123_XYZ')).toBe(true);
    expect(isPublicSupabaseKey(jwt({ role: 'anon', ref: 'x' }))).toBe(true);
    expect(isPublicSupabaseKey('sb_secret_abc123')).toBe(false);
    expect(isPublicSupabaseKey(jwt({ role: 'service_role' }))).toBe(false);
    expect(isPublicSupabaseKey('sb_publishable_a sb_secret_b')).toBe(false);
  });
});

describe('card location line', () => {
  it('drops a place already shown as part of an earlier one', () => {
    expect(locationText(['Bangalore, Karnataka', 'Karnataka', 'Bangalore'])).toBe('Bangalore, Karnataka');
    expect(locationText(['India', 'Bangalore, Karnataka', 'Karnataka', 'Bangalore', 'Chennai, Tamil Nadu', 'Tamil Nadu', 'Chennai'])).toBe('India | Bangalore, Karnataka | Chennai, Tamil Nadu');
    expect(locationText(['Pune', 'Bengaluru'])).toBe('Pune | Bengaluru');
    expect(locationText([])).toBe('');
  });
});
