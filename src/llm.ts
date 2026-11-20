/**
 * One tagging call to Azure OpenAI's v1 endpoint (OpenAI-compatible) through the official `openai` SDK:
 * the Responses API with a strict JSON schema. Returns the parsed JSON, the token usage, the cost and
 * the rate-limit headers (for pacing). No message ever contains the key or the post text.
 */
import OpenAI from 'openai';
import type { ModelConfig } from './config.ts';
import { optionalEnv, requireEnv } from './env.ts';

export interface Connection {
  apiKey: string;
  baseURL: string;
}

/**
 * The endpoint (AZURE_OPENAI_BASE_URL) and key (AZURE_OPENAI_API_KEY) come from the environment, so the
 * public repo names no Azure resource. A dry run never calls the model, so it may run without them.
 */
export function connectionFromEnv(dryRun = false): Connection {
  if (dryRun) {
    return { apiKey: optionalEnv('AZURE_OPENAI_API_KEY') ?? 'dry-run', baseURL: optionalEnv('AZURE_OPENAI_BASE_URL') ?? 'https://dry-run.invalid/openai/v1/' };
  }
  return { apiKey: requireEnv('AZURE_OPENAI_API_KEY'), baseURL: requireEnv('AZURE_OPENAI_BASE_URL') };
}

export interface Usage {
  input: number;
  cachedInput: number;
  output: number;
  reasoning: number;
}

export interface RateLimits {
  limitRequests?: number;
  remainingRequests?: number;
  limitTokens?: number;
  remainingTokens?: number;
}

export type LlmResult =
  | { status: 'ok'; json: unknown; usage: Usage; costUsd: number; seconds: number; limits: RateLimits }
  | {
      status: 'refused' | 'incomplete' | 'invalid_json' | 'error' | 'rate_limited';
      message: string;
      usage?: Usage;
      costUsd: number;
      seconds: number;
      httpStatus?: number;
      limits?: RateLimits;
    };

/** USD for one call. Cached input tokens are part of input_tokens and billed at the cached price. */
export function costOf(u: Usage, prices: ModelConfig['prices']): number {
  const uncached = Math.max(0, u.input - u.cachedInput);
  return (uncached * prices.input + u.cachedInput * prices.cached_input + u.output * prices.output) / 1e6;
}

function num(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function limitsOf(headers: Headers | undefined): RateLimits {
  if (!headers) return {};
  return {
    limitRequests: num(headers.get('x-ratelimit-limit-requests')),
    remainingRequests: num(headers.get('x-ratelimit-remaining-requests')),
    limitTokens: num(headers.get('x-ratelimit-limit-tokens')),
    remainingTokens: num(headers.get('x-ratelimit-remaining-tokens')),
  };
}

export interface Llm {
  model: string;
  call(instructions: string, input: string, schema: Record<string, unknown>): Promise<LlmResult>;
}

export function createLlm(model: ModelConfig, conn: Connection): Llm {
  // No SDK retries: the tagger retries through its shared pacer, so retries count toward the limits.
  const client = new OpenAI({ apiKey: conn.apiKey, baseURL: conn.baseURL, maxRetries: 0, timeout: 90_000 });
  return {
    model: model.model_id,
    async call(instructions, input, schema) {
      const started = Date.now();
      const seconds = (): number => Math.round((Date.now() - started) / 100) / 10;
      try {
        const { data, response } = await client.responses
          .create({
            model: model.model_id,
            instructions,
            input,
            reasoning: { effort: model.reasoning_effort as 'low' },
            max_output_tokens: model.max_output_tokens,
            text: { format: { type: 'json_schema', name: 'tags', schema, strict: true } },
            store: false,
          })
          .withResponse();
        const u = data.usage;
        const usage: Usage = {
          input: u?.input_tokens ?? 0,
          cachedInput: u?.input_tokens_details?.cached_tokens ?? 0,
          output: u?.output_tokens ?? 0,
          reasoning: u?.output_tokens_details?.reasoning_tokens ?? 0,
        };
        const costUsd = costOf(usage, model.prices);
        const limits = limitsOf(response.headers);
        const refused = data.output.some(
          (item) => item.type === 'message' && item.content.some((c) => c.type === 'refusal'),
        );
        if (refused) return { status: 'refused', message: 'the model refused', usage, costUsd, seconds: seconds(), limits };
        if (data.status !== 'completed') {
          const why = data.incomplete_details?.reason ?? data.status ?? 'unknown';
          return { status: 'incomplete', message: `response ${String(why)}`, usage, costUsd, seconds: seconds(), limits };
        }
        try {
          return { status: 'ok', json: JSON.parse(data.output_text), usage, costUsd, seconds: seconds(), limits };
        } catch {
          return { status: 'invalid_json', message: 'the answer was not valid JSON', usage, costUsd, seconds: seconds(), limits };
        }
      } catch (err) {
        if (err instanceof OpenAI.APIError) {
          const status = err.status;
          return {
            status: status === 429 ? 'rate_limited' : 'error',
            // Status and error type only: a provider message can quote the request.
            message: `HTTP ${status ?? '?'} ${err.type ?? err.name}`,
            costUsd: 0,
            seconds: seconds(),
            httpStatus: status,
            limits: limitsOf(err.headers as Headers | undefined),
          };
        }
        return { status: 'error', message: err instanceof Error ? err.name : 'request failed', costUsd: 0, seconds: seconds() };
      }
    },
  };
}
