/**
 * Sends one task to a GPT model on Azure OpenAI and either writes the files it returns (mode "files")
 * or prints its answer (mode "text"). Used for the front-end worker and for independent reviews.
 * Files are written only under --allow, never into site/data or site/samples. Tokens and cost are printed.
 *
 * npx tsx src/tools/gpt-worker.ts --model gpt-6.2-sol --effort medium --mode files --allow site/ \
 *   --task <task.md> --context <file1,file2,...>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, normalize } from 'node:path';
import OpenAI from 'openai';
import { loadConfig } from '../config.ts';
import { loadEnv } from '../env.ts';
import { connectionFromEnv } from '../llm.ts';

const PRICES: Record<string, { input: number; cached: number; output: number }> = {
  'gpt-6.2-astra': { input: 10, cached: 1, output: 50 },
  'gpt-6.2-sol': { input: 2, cached: 0.2, output: 10 },
  'gpt-6.1-terra': { input: 2, cached: 0.2, output: 10 },
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
};

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (value === undefined) throw new Error(`--${name} is required`);
  return value;
}

loadEnv();
const cfg = loadConfig();
const model = arg('model');
const effort = arg('effort', 'medium') as 'low' | 'medium' | 'high';
const mode = arg('mode', 'text');
const allow = normalize(arg('allow', 'site/'));
const task = readFileSync(arg('task'), 'utf8');
const context = arg('context', '')
  .split(',')
  .filter((p) => p.trim() !== '')
  .map((p) => `===== FILE: ${p.trim()} =====\n${readFileSync(p.trim(), 'utf8')}`)
  .join('\n\n');

const client = new OpenAI({ ...connectionFromEnv(), timeout: 20 * 60_000, maxRetries: 1 });

const filesSchema = {
  type: 'object',
  properties: {
    files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false } },
    notes: { type: 'string' },
  },
  required: ['files', 'notes'],
  additionalProperties: false,
};

const started = Date.now();
const stream = await client.responses.create({
  model,
  reasoning: { effort },
  max_output_tokens: 120_000,
  instructions: task,
  input: context === '' ? 'Begin.' : context,
  store: false,
  stream: true,
  ...(mode === 'files' ? { text: { format: { type: 'json_schema' as const, name: 'files', schema: filesSchema, strict: true } } } : {}),
});

let text = '';
let usage: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } | undefined;
let status = 'unknown';
for await (const event of stream) {
  if (event.type === 'response.output_text.delta') text += event.delta;
  if (event.type === 'response.completed' || event.type === 'response.incomplete') {
    usage = event.response.usage ?? undefined;
    status = event.response.status ?? status;
  }
}

const p = PRICES[model] ?? { input: 0, cached: 0, output: 0 };
const input = usage?.input_tokens ?? 0;
const cached = usage?.input_tokens_details?.cached_tokens ?? 0;
const output = usage?.output_tokens ?? 0;
const cost = ((input - cached) * p.input + cached * p.cached + output * p.output) / 1e6;
console.log(`model ${model} | status ${status} | ${Math.round((Date.now() - started) / 1000)} s | input ${input} (cached ${cached}) | output ${output} | ~$${cost.toFixed(3)}`);

if (mode !== 'files') {
  console.log(text);
} else {
  const parsed = JSON.parse(text) as { files: { path: string; content: string }[]; notes: string };
  for (const f of parsed.files) {
    const path = normalize(f.path.replace(/^\.?[\\/]/, ''));
    if (!path.startsWith(allow) || path.includes('..') || /[\\/](data|samples)[\\/]/.test(path)) {
      console.log(`REFUSED (outside ${allow} or protected): ${f.path}`);
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, f.content.endsWith('\n') ? f.content : `${f.content}\n`);
    console.log(`wrote ${path} (${f.content.split('\n').length} lines)`);
  }
  console.log(`NOTES: ${parsed.notes}`);
}
