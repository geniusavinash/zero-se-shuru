/**
 * Step 4: one LLM call per post, with a cache. The cache key covers everything the model sees plus the
 * model and the prompt version, so an unchanged post costs nothing on the next run. Each answer is
 * appended to data/tag_cache.jsonl as it arrives, and each call to data/llm_calls.jsonl.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { Config } from './config.ts';
import { excerpt } from './excerpt.ts';
import type { Llm, LlmResult } from './llm.ts';
import { sha256 } from './text.ts';
import { GENUINE, JOB_TYPES, type Job, LOCATION_STATUS, type LlmTotals, type TagRecord, type Tags } from './types.ts';

export const CACHE_PATH = 'data/tag_cache.jsonl';
export const CALL_LOG_PATH = 'data/llm_calls.jsonl';

export interface FixedPart {
  instructions: string;
  schema: Record<string, unknown>;
  roleIds: string[];
  cityIds: string[];
}

export function buildFixedPart(cfg: Config): FixedPart {
  const tax = cfg.taxonomy;
  const roleIds = tax.roles.map((r) => r.id);
  const cityIds = [...tax.cities, ...tax.special_cities].map((c) => c.id);
  const roles = tax.roles
    .map((r) => `- ${r.id}: ${r.definition}${r.examples.length ? ` Examples: ${r.examples.join('; ')}.` : ''}`)
    .join('\n');
  const prompt = readFileSync(cfg.model.prompt_file, 'utf8').replace(/\r\n?/g, '\n').trim();
  const instructions = prompt
    .replace('{{ROLES}}', roles)
    .replace('{{TIE_BREAKS}}', tax.tie_breaks.map((t) => `- ${t}`).join('\n'))
    .replace('{{CITIES}}', tax.cities.map((c) => c.id).join(', '));
  if (/\{\{[A-Z_]+\}\}/.test(instructions)) throw new Error(`${cfg.model.prompt_file}: a placeholder was not filled`);
  const schema = {
    type: 'object',
    properties: {
      evidence: { type: 'string' },
      min_experience_years: { type: ['number', 'null'] },
      invites_freshers: { type: 'boolean' },
      job_type: { type: 'string', enum: [...JOB_TYPES] },
      genuine: { type: 'string', enum: [...GENUINE] },
      in_india: { type: 'boolean' },
      role: { type: 'string', enum: roleIds },
      cities: { type: 'array', items: { type: 'string', enum: cityIds } },
      location_status: { type: 'string', enum: [...LOCATION_STATUS] },
    },
    required: ['evidence', 'min_experience_years', 'invites_freshers', 'job_type', 'genuine', 'in_india', 'role', 'cities', 'location_status'],
    additionalProperties: false,
  };
  return { instructions, schema, roleIds, cityIds };
}

export function userMessage(job: Job): string {
  const safe = (s: string): string => s.replace(/<\s*\/?\s*post\s*>/gi, ' ');
  const lines = [
    `Title: ${safe(job.title)}`,
    `Employer: ${safe(job.company)}`,
    `Location fields: ${safe(job.locations.join(' | ') || '(none)')}`,
  ];
  if (job.country) lines.push(`Country field: ${safe(job.country)}`);
  if (job.workplace) lines.push(`Workplace: ${safe(job.workplace)}`);
  if (job.employment) lines.push(`Employment: ${safe(job.employment)}`);
  lines.push(`Text: ${safe(excerpt(job.description))}`);
  return `<post>\n${lines.join('\n')}\n</post>`;
}

/**
 * Everything the model sees, plus the model settings: a changed prompt, schema, field or post never
 * reuses an old answer (review fix: employer, country, workplace and employment are in the message).
 */
export function cacheKey(job: Job, cfg: Config, fixed: FixedPart): string {
  return sha256(
    JSON.stringify(['v2', cfg.model.model_id, cfg.model.reasoning_effort, cfg.model.prompt_version, fixed.instructions, fixed.schema, job.key, userMessage(job), job.description]),
  );
}

export function tagsSchema(fixed: FixedPart) {
  return z.object({
    evidence: z.string(),
    min_experience_years: z.number().min(0).max(60).nullable(),
    invites_freshers: z.boolean(),
    job_type: z.enum(JOB_TYPES),
    genuine: z.enum(GENUINE),
    in_india: z.boolean(),
    role: z.enum(fixed.roleIds as [string, ...string[]]),
    cities: z.array(z.enum(fixed.cityIds as [string, ...string[]])),
    location_status: z.enum(LOCATION_STATUS),
  });
}

export function loadCache(path = CACHE_PATH): Map<string, TagRecord> {
  const cache = new Map<string, TagRecord>();
  if (!existsSync(path)) return cache;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      const rec = JSON.parse(line) as TagRecord;
      cache.set(rec.hash, rec);
    } catch {
      // A half-written last line from a stopped run: skip it; that post is tagged again.
    }
  }
  return cache;
}

export interface TagRunOptions {
  runId: string;
  maxNewCalls?: number;
  maxMinutes?: number;
  log?: (s: string) => void;
}

export interface TagOutcome {
  tags: Map<string, Tags>;
  failed: Map<string, string>;
  waiting: number;
  totals: LlmTotals;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function tagAll(jobs: Job[], cfg: Config, llm: Llm, opts: TagRunOptions): Promise<TagOutcome> {
  const fixed = buildFixedPart(cfg);
  const schema = tagsSchema(fixed);
  const cache = loadCache();
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  const tags = new Map<string, Tags>();
  const failed = new Map<string, string>();
  const totals: LlmTotals = { calls: 0, cacheHits: 0, failed: 0, input: 0, cachedInput: 0, output: 0, costUsd: 0 };
  const todo: { job: Job; hash: string }[] = [];
  for (const job of jobs) {
    const hash = cacheKey(job, cfg, fixed);
    const hit = cache.get(hash);
    if (hit) {
      tags.set(job.key, hit.tags);
      totals.cacheHits++;
    } else todo.push({ job, hash });
  }
  const limit = Math.min(todo.length, opts.maxNewCalls ?? Number.POSITIVE_INFINITY);
  opts.log?.(`tagging: ${totals.cacheHits} from cache, ${todo.length} new${limit < todo.length ? ` (only ${limit} this run)` : ''}`);
  const started = Date.now();
  const gap = 60_000 / cfg.model.rpm;
  let nextStart = Date.now();
  let index = 0;
  let done = 0;

  const record = (job: Job, hash: string, r: LlmResult, attempt: number): void => {
    totals.calls++;
    if (r.usage) {
      totals.input += r.usage.input;
      totals.cachedInput += r.usage.cachedInput;
      totals.output += r.usage.output;
    }
    totals.costUsd += r.costUsd;
    appendFileSync(
      CALL_LOG_PATH,
      `${JSON.stringify({ at: new Date().toISOString(), run: opts.runId, post: hash.slice(0, 16), model: cfg.model.model_id, prompt: cfg.model.prompt_version, attempt, status: r.status, input: r.usage?.input ?? 0, cachedInput: r.usage?.cachedInput ?? 0, output: r.usage?.output ?? 0, reasoning: r.usage?.reasoning ?? 0, costUsd: Number(r.costUsd.toFixed(8)), seconds: r.seconds })}\n`,
    );
  };

  /**
   * One shared pacer for every worker: requests per minute and estimated tokens per minute. A 429 pushes
   * the next start back for all workers. Each attempted post ends with exactly one outcome.
   */
  async function worker(): Promise<void> {
    while (index < limit) {
      if (opts.maxMinutes !== undefined && Date.now() - started > opts.maxMinutes * 60_000) return;
      const item = todo[index++];
      if (!item) return;
      const message = userMessage(item.job);
      const estTokens = Math.ceil((fixed.instructions.length + message.length) / 4) + 300;
      const gapMs = Math.max(gap, (estTokens * 60_000) / cfg.model.tpm);
      let outcome = 'error';
      for (let attempt = 1; attempt <= 3; attempt++) {
        const wait = nextStart - Date.now();
        nextStart = Math.max(nextStart, Date.now()) + gapMs;
        if (wait > 0) await sleep(wait);
        const r = await llm.call(fixed.instructions, message, fixed.schema);
        record(item.job, item.hash, r, attempt);
        outcome = r.status;
        if (r.status === 'ok') {
          const parsed = schema.safeParse(r.json);
          if (parsed.success) {
            tags.set(item.job.key, parsed.data);
            // The cache is committed to git, and no Adzuna post text goes into git (REQUIREMENTS): an Adzuna
            // post's evidence phrase is not stored. Its card shows the deciding fact, never the phrase.
            const stored = item.job.aggregator ? { ...parsed.data, evidence: '' } : parsed.data;
            appendFileSync(CACHE_PATH, `${JSON.stringify({ hash: item.hash, model: cfg.model.model_id, promptVersion: cfg.model.prompt_version, at: new Date().toISOString(), tags: stored } satisfies TagRecord)}\n`);
            break;
          }
          outcome = 'invalid answer';
          continue;
        }
        if (r.status === 'rate_limited') {
          nextStart = Math.max(nextStart, Date.now() + 10_000 * attempt);
          continue;
        }
        if (r.status === 'error' || r.status === 'invalid_json') continue;
        break; // refused or incomplete: asking again gives the same answer
      }
      if (!tags.has(item.job.key)) failed.set(item.job.key, outcome);
      done++;
      if (done % 100 === 0) opts.log?.(`  tagged ${done}/${limit} · $${totals.costUsd.toFixed(3)} · ${Math.round((Date.now() - started) / 1000)} s`);
    }
  }

  await Promise.all(Array.from({ length: cfg.model.concurrency }, () => worker()));
  totals.failed = failed.size;
  const waiting = todo.length - done;
  return { tags, failed, waiting, totals };
}
