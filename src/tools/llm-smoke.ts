/**
 * One real call with a made-up post, to prove the key, the endpoint, the deployment name and the
 * structured-output request before a real run. Prints the answer, tokens, cost and rate limits.
 * Run: npx tsx src/tools/llm-smoke.ts
 */
import { loadConfig } from '../config.ts';
import { loadEnv } from '../env.ts';
import { connectionFromEnv, createLlm } from '../llm.ts';

loadEnv();
const cfg = loadConfig();
const llm = createLlm(cfg.model, connectionFromEnv());

const schema = {
  type: 'object',
  properties: {
    role: { type: 'string', enum: ['software_development', 'data_analytics_ai', 'other'] },
    min_experience_years: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    invites_freshers: { type: 'boolean' },
  },
  required: ['role', 'min_experience_years', 'invites_freshers'],
  additionalProperties: false,
};

const post = [
  '<post>',
  'Title: Software Engineer Intern (2026 batch)',
  'Employer: Example Labs',
  'Location fields: Bengaluru, Karnataka, India',
  'Text: We are hiring final-year students and freshers. No prior experience needed. Stipend provided.',
  '</post>',
].join('\n');

const result = await llm.call('Report facts about the job post. Answer only with the schema.', post, schema);
console.log(JSON.stringify({ model: llm.model, ...result }, null, 2));
process.exitCode = result.status === 'ok' ? 0 : 1;
