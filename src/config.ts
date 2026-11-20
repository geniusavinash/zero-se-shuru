/** Loads and checks every config file once. A wrong value stops the run with the file and field named. */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import type { SourceName } from './types.ts';

const Site = z.object({
  name: z.string().min(1),
  tagline: z.string(),
  public_url: z.url(),
  repo_url: z.string(),
  panels: z.boolean(),
  min_shown: z.number().int().nonnegative(),
  max_age_days: z.number().int().positive(),
  max_age_days_direct: z.number().int().positive(),
  max_candidates_per_company: z.number().int().positive(),
  max_shown_per_company: z.number().int().positive(),
  max_adzuna_shown: z.number().int().nonnegative(),
  adzuna_pages: z.number().int().min(1).max(10),
  actions_max_new_tags: z.number().int().positive(),
  actions_max_minutes: z.number().positive(),
  stale_after_hours: z.number().positive(),
});

const Rules = z.object({
  experience_limit_years: z.number().positive(),
  title: z.object({
    drop_words: z.array(z.string()),
    entry_words: z.array(z.string()),
    neutral_phrases: z.array(z.string()),
    min_years_in_title_to_drop: z.number().positive(),
    junk_phrases: z.array(z.string()),
  }),
});

const Model = z.object({
  provider: z.literal('azure_openai'),
  model_id: z.string().min(1),
  reasoning_effort: z.enum(['minimal', 'low', 'medium', 'high', 'xhigh']),
  max_output_tokens: z.number().int().positive(),
  prompt_file: z.string(),
  prompt_version: z.string(),
  rpm: z.number().positive(),
  tpm: z.number().positive(),
  concurrency: z.number().int().positive(),
  prices: z.object({ input: z.number(), cached_input: z.number(), output: z.number() }),
});

const City = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  context_aliases: z.array(z.string()).optional(),
});

const Taxonomy = z.object({
  roles: z.array(z.object({ id: z.string(), name: z.string(), kind: z.string(), definition: z.string(), examples: z.array(z.string()) })),
  tie_breaks: z.array(z.string()),
  cities: z.array(City),
  special_cities: z.array(City),
  metro_groups: z.array(z.object({ id: z.string(), name: z.string(), cities: z.array(z.string()) })),
  top_metros: z.array(z.string()),
  states: z.array(z.string()),
  needs_india_context: z.array(z.string()),
  foreign_guard_cities: z.array(z.string()),
  foreign_markers: z.object({
    countries: z.array(z.string()),
    us_states: z.array(z.string()),
    us_state_codes: z.array(z.string()),
    other: z.array(z.string()),
  }),
  remote_aliases: z.array(z.string()),
});

export type SiteConfig = z.infer<typeof Site>;
export type RulesConfig = z.infer<typeof Rules>;
export type ModelConfig = z.infer<typeof Model>;
export type TaxonomyConfig = z.infer<typeof Taxonomy>;

export interface Board {
  ats: Exclude<SourceName, 'adzuna'>;
  token: string;
  /** Empty for Greenhouse: every job carries company_name. */
  company: string;
  on: boolean;
}

export interface Config {
  site: SiteConfig;
  rules: RulesConfig;
  model: ModelConfig;
  taxonomy: TaxonomyConfig;
  boards: Board[];
}

function yamlFile<T>(path: string, schema: z.ZodType<T>): T {
  const result = schema.safeParse(parse(readFileSync(path, 'utf8')));
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`${path}: ${issue?.path.join('.') || '(root)'}: ${issue?.message ?? 'invalid'}`);
  }
  return result.data;
}

export function parseBoards(text: string, path = 'config/boards.csv'): Board[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines[0]?.split(',').map((h) => h.trim());
  if (header?.join(',') !== 'ats,token,company,on') throw new Error(`${path}: the header must be ats,token,company,on`);
  return lines.slice(1).map((line, i) => {
    const [ats, token, company, on] = line.split(',').map((c) => c.trim());
    if (ats !== 'greenhouse' && ats !== 'lever' && ats !== 'ashby') throw new Error(`${path} line ${i + 2}: unknown ats "${ats}"`);
    if (!token) throw new Error(`${path} line ${i + 2}: empty token`);
    if (on !== 'yes' && on !== 'no') throw new Error(`${path} line ${i + 2}: "on" must be yes or no`);
    return { ats, token, company: company ?? '', on: on === 'yes' };
  });
}

export function loadConfig(root = '.'): Config {
  return {
    site: yamlFile(`${root}/config/site.yaml`, Site),
    rules: yamlFile(`${root}/config/rules.yaml`, Rules),
    model: yamlFile(`${root}/config/model.yaml`, Model),
    taxonomy: yamlFile(`${root}/config/taxonomy.yaml`, Taxonomy),
    boards: parseBoards(readFileSync(`${root}/config/boards.csv`, 'utf8')),
  };
}
