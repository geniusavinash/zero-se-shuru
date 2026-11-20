/** Shared shapes (ARCHITECTURE §4). */

export type SourceName = 'greenhouse' | 'lever' | 'ashby' | 'adzuna';
export const SOURCE_NAMES: readonly SourceName[] = ['greenhouse', 'lever', 'ashby', 'adzuna'];

/** One post from any source, after mapping. */
export interface Job {
  /** source:board:id, or adzuna:<sha256(id)[:16]>. */
  key: string;
  source: SourceName;
  board: string;
  sourceId: string;
  title: string;
  company: string;
  /** Every location string the source gives, as written. */
  locations: string[];
  /** The source's own country field, when it has one. */
  country?: string;
  /** remote, hybrid, onsite... as the source writes it. */
  workplace?: string;
  /** The source's own employment label (full time, intern...). */
  employment?: string;
  /** Plain text. */
  description: string;
  /** ISO UTC. */
  postedAt?: string;
  url: string;
  aggregator: boolean;
}

export const JOB_TYPES = ['internship', 'apprenticeship', 'full_time', 'part_time', 'contract', 'other'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const GENUINE = ['ok', 'agency_generic', 'walk_in', 'pay_or_scam', 'placeholder'] as const;
export type Genuine = (typeof GENUINE)[number];

export const LOCATION_STATUS = ['city_listed', 'remote_india', 'pan_india_or_multiple', 'unknown'] as const;
export type LocationStatus = (typeof LOCATION_STATUS)[number];

/** What the LLM reports for one post. */
export interface Tags {
  evidence: string;
  min_experience_years: number | null;
  invites_freshers: boolean;
  job_type: JobType;
  genuine: Genuine;
  in_india: boolean;
  role: string;
  cities: string[];
  location_status: LocationStatus;
}

/** One line of data/tag_cache.jsonl. */
export interface TagRecord {
  /** sha256(model + prompt version + key + title + locations + raw description). */
  hash: string;
  model: string;
  promptVersion: string;
  at: string;
  tags: Tags;
}

/** Output of the location rule (src/india.ts). */
export interface LocationResult {
  isIndia: boolean;
  cities: string[];
  remote: boolean;
}

export type DecisionReason =
  | 'hidden'
  | 'blocked'
  | 'untagged'
  | 'not_genuine'
  | 'scam_company'
  | 'not_india'
  | 'job_type_other'
  | 'internship'
  | 'min_experience_under_limit'
  | 'min_experience_over_limit'
  | 'invites_freshers'
  | 'unclear';

export interface Decision {
  shown: boolean;
  reason: DecisionReason;
}

/** One card on the page. */
export interface Row {
  key: string;
  title: string;
  company: string;
  /** Lowercase company name without legal words; what the admin's "block company" uses. */
  companyKey: string;
  role: string;
  cities: string[];
  cityLinks: { city: string; url: string }[];
  locationText: string;
  remote: boolean;
  jobType: JobType;
  postedAt?: string;
  firstSeen: string;
  source: SourceName;
  aggregator: boolean;
  url: string;
  why: string;
  isNew: boolean;
  overridden: boolean;
  /** Other keys merged into this card. */
  memberKeys: string[];
}

export interface RunCounts {
  read: number;
  india: number;
  candidates: number;
  tagged: number;
  eligible: number;
  duplicates: number;
  shown: number;
  cityMismatch: number;
}

export interface LlmTotals {
  calls: number;
  cacheHits: number;
  failed: number;
  input: number;
  cachedInput: number;
  output: number;
  costUsd: number;
}

export interface RunRecord {
  id: string;
  startedAt: string;
  finishedAt: string;
  trigger: 'schedule' | 'manual' | 'local';
  ok: boolean;
  blockedReason?: string;
  /** Persisted with the run so the history and the measured numbers never depend on today's files. */
  newPosts: number;
  model: string;
  promptVersion: string;
  counts: RunCounts;
  perSource: Partial<Record<SourceName, RunCounts & { boardsOk: number; boardsFailed: number }>>;
  llm: LlmTotals;
}
