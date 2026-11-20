import { describe, expect, it } from 'vitest';
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
