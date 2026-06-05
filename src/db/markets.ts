import { getDb } from './connection.js';

export type MarketStatus = 'active' | 'archived';
export type MarketSourceType =
  | 'url'
  | 'website'
  | 'docs'
  | 'blog'
  | 'rss'
  | 'search_query'
  | 'slack'
  | 'exact_url'
  | 'manual';
export type MarketSourceTrustTier = 'official' | 'trusted' | 'third_party' | 'search' | 'private';
export type MarketRunKind = 'setup' | 'collection' | 'extraction' | 'brief';
export type MarketRunStatus = 'running' | 'completed' | 'failed';
export type MarketDocumentStatus = 'fetched' | 'failed' | 'skipped';
export type MarketCandidateType = 'company' | 'product' | 'problem' | 'capability' | 'category' | 'claim';
export type MarketCandidateConfidence = 'low' | 'medium' | 'high';
export type MarketCandidateStatus = 'proposed' | 'accepted' | 'rejected';
export type MarketSourceProposalStatus = 'proposed' | 'accepted' | 'rejected';

export interface Market {
  id: string;
  name: string;
  description: string | null;
  status: MarketStatus;
  created_at: string;
  updated_at: string;
}

export interface MarketBoundary {
  market_id: string;
  inclusions: string | null;
  exclusions: string | null;
  adjacent_markets: string | null;
  notes: string | null;
  updated_at: string;
}

export interface MarketSource {
  id: string;
  market_id: string;
  url: string;
  source_type: MarketSourceType;
  trust_tier: MarketSourceTrustTier;
  status: MarketStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketRun {
  id: string;
  market_id: string;
  source_id: string | null;
  kind: MarketRunKind;
  status: MarketRunStatus;
  started_at: string;
  completed_at: string | null;
  summary: string | null;
}

export interface MarketDocument {
  id: string;
  market_id: string;
  source_id: string;
  run_id: string | null;
  url: string;
  canonical_url: string | null;
  title: string | null;
  content_text: string;
  content_hash: string | null;
  status: MarketDocumentStatus;
  error: string | null;
  fetched_at: string;
  created_at: string;
  metadata_json: string | null;
}

export interface MarketCandidateEvidence {
  document_id: string;
  quote?: string | null;
  note?: string | null;
}

export interface MarketCandidate {
  id: string;
  market_id: string;
  run_id: string | null;
  candidate_type: MarketCandidateType;
  name: string;
  summary: string | null;
  confidence: MarketCandidateConfidence;
  status: MarketCandidateStatus;
  evidence_json: string;
  metadata_json: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
}

export interface MarketCandidateSummary {
  market_id: string;
  total: number;
  by_status: Partial<Record<MarketCandidateStatus, number>>;
  by_type: Partial<Record<MarketCandidateType, number>>;
  by_confidence: Partial<Record<MarketCandidateConfidence, number>>;
  latest_extraction_run: MarketRun | null;
}

export interface MarketSourceProposal {
  id: string;
  market_id: string;
  url: string;
  normalized_url: string;
  source_type: MarketSourceType;
  trust_tier: MarketSourceTrustTier;
  title: string | null;
  snippet: string | null;
  rationale: string;
  discovered_from: string | null;
  search_query: string | null;
  proposed_entity_name: string | null;
  proposed_entity_type: string | null;
  status: MarketSourceProposalStatus;
  source_id: string | null;
  review_note: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
}

function now(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeMarketUrl(input: string): string {
  const url = new URL(input);
  url.hash = '';
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/g, '');
  }
  return url.toString();
}

export function createMarket(input: { name: string; description?: string | null; status?: MarketStatus }): Market {
  const at = now();
  const market: Market = {
    id: id('mkt'),
    name: input.name,
    description: input.description ?? null,
    status: input.status ?? 'active',
    created_at: at,
    updated_at: at,
  };

  getDb()
    .prepare(
      `INSERT INTO markets (id, name, description, status, created_at, updated_at)
       VALUES (@id, @name, @description, @status, @created_at, @updated_at)`,
    )
    .run(market);

  return market;
}

export function getMarket(id: string): Market | undefined {
  return getDb().prepare('SELECT * FROM markets WHERE id = ?').get(id) as Market | undefined;
}

export function getMarketByName(name: string): Market | undefined {
  return getDb().prepare('SELECT * FROM markets WHERE name = ?').get(name) as Market | undefined;
}

export function listMarkets(): Market[] {
  return getDb().prepare('SELECT * FROM markets ORDER BY name').all() as Market[];
}

export function updateMarket(id: string, updates: Partial<Pick<Market, 'name' | 'description' | 'status'>>): Market {
  const fields: string[] = [];
  const values: Record<string, unknown> = { id, updated_at: now() };

  for (const key of ['name', 'description', 'status'] as const) {
    if (updates[key] !== undefined) {
      fields.push(`${key} = @${key}`);
      values[key] = updates[key];
    }
  }

  if (fields.length === 0) {
    const existing = getMarket(id);
    if (!existing) throw new Error(`market not found: ${id}`);
    return existing;
  }

  fields.push('updated_at = @updated_at');
  const result = getDb()
    .prepare(`UPDATE markets SET ${fields.join(', ')} WHERE id = @id`)
    .run(values);
  if (result.changes === 0) throw new Error(`market not found: ${id}`);

  return getMarket(id)!;
}

export function upsertMarketBoundary(input: {
  market_id: string;
  inclusions?: string | null;
  exclusions?: string | null;
  adjacent_markets?: string | null;
  notes?: string | null;
}): MarketBoundary {
  const boundary: MarketBoundary = {
    market_id: input.market_id,
    inclusions: input.inclusions ?? null,
    exclusions: input.exclusions ?? null,
    adjacent_markets: input.adjacent_markets ?? null,
    notes: input.notes ?? null,
    updated_at: now(),
  };

  getDb()
    .prepare(
      `INSERT INTO market_boundaries
         (market_id, inclusions, exclusions, adjacent_markets, notes, updated_at)
       VALUES
         (@market_id, @inclusions, @exclusions, @adjacent_markets, @notes, @updated_at)
       ON CONFLICT(market_id) DO UPDATE SET
         inclusions = excluded.inclusions,
         exclusions = excluded.exclusions,
         adjacent_markets = excluded.adjacent_markets,
         notes = excluded.notes,
         updated_at = excluded.updated_at`,
    )
    .run(boundary);

  return getMarketBoundary(input.market_id)!;
}

export function getMarketBoundary(marketId: string): MarketBoundary | undefined {
  return getDb().prepare('SELECT * FROM market_boundaries WHERE market_id = ?').get(marketId) as
    | MarketBoundary
    | undefined;
}

export function addMarketSource(input: {
  market_id: string;
  url: string;
  source_type: MarketSourceType;
  trust_tier: MarketSourceTrustTier;
  notes?: string | null;
  status?: MarketStatus;
}): MarketSource {
  if (input.source_type === 'url') {
    throw new Error(
      'source_type must be explicit; use exact_url, website, docs, blog, rss, search_query, slack, or manual',
    );
  }

  const at = now();
  const source: MarketSource = {
    id: id('msrc'),
    market_id: input.market_id,
    url: input.url,
    source_type: input.source_type,
    trust_tier: input.trust_tier,
    status: input.status ?? 'active',
    notes: input.notes ?? null,
    created_at: at,
    updated_at: at,
  };

  getDb()
    .prepare(
      `INSERT INTO market_sources
         (id, market_id, url, source_type, trust_tier, status, notes, created_at, updated_at)
       VALUES
         (@id, @market_id, @url, @source_type, @trust_tier, @status, @notes, @created_at, @updated_at)`,
    )
    .run(source);

  return source;
}

export function listMarketSources(marketId: string): MarketSource[] {
  return getDb()
    .prepare('SELECT * FROM market_sources WHERE market_id = ? ORDER BY created_at, id')
    .all(marketId) as MarketSource[];
}

export function findMarketSourceByNormalizedUrl(marketId: string, url: string): MarketSource | undefined {
  const normalizedUrl = normalizeMarketUrl(url);
  return listMarketSources(marketId).find((source) => normalizeMarketUrl(source.url) === normalizedUrl);
}

export function createMarketSourceProposal(input: {
  market_id: string;
  url: string;
  source_type: MarketSourceType;
  trust_tier: MarketSourceTrustTier;
  title?: string | null;
  snippet?: string | null;
  rationale: string;
  discovered_from?: string | null;
  search_query?: string | null;
  proposed_entity_name?: string | null;
  proposed_entity_type?: string | null;
  metadata?: unknown;
}): MarketSourceProposal {
  if (input.source_type === 'url') {
    throw new Error(
      'source_type must be explicit; use exact_url, website, docs, blog, rss, search_query, slack, or manual',
    );
  }
  if (input.rationale.trim() === '') {
    throw new Error('source proposal rationale is required');
  }

  const at = now();
  const proposal: MarketSourceProposal = {
    id: id('msprop'),
    market_id: input.market_id,
    url: input.url,
    normalized_url: normalizeMarketUrl(input.url),
    source_type: input.source_type,
    trust_tier: input.trust_tier,
    title: input.title ?? null,
    snippet: input.snippet ?? null,
    rationale: input.rationale,
    discovered_from: input.discovered_from ?? null,
    search_query: input.search_query ?? null,
    proposed_entity_name: input.proposed_entity_name ?? null,
    proposed_entity_type: input.proposed_entity_type ?? null,
    status: 'proposed',
    source_id: null,
    review_note: null,
    metadata_json: input.metadata === undefined || input.metadata === null ? null : JSON.stringify(input.metadata),
    created_at: at,
    updated_at: at,
    reviewed_at: null,
  };

  getDb()
    .prepare(
      `INSERT INTO market_source_proposals
         (id, market_id, url, normalized_url, source_type, trust_tier, title, snippet, rationale, discovered_from, search_query, proposed_entity_name, proposed_entity_type, status, source_id, review_note, metadata_json, created_at, updated_at, reviewed_at)
       VALUES
         (@id, @market_id, @url, @normalized_url, @source_type, @trust_tier, @title, @snippet, @rationale, @discovered_from, @search_query, @proposed_entity_name, @proposed_entity_type, @status, @source_id, @review_note, @metadata_json, @created_at, @updated_at, @reviewed_at)`,
    )
    .run(proposal);

  return proposal;
}

export function getMarketSourceProposal(id: string): MarketSourceProposal | undefined {
  return getDb().prepare('SELECT * FROM market_source_proposals WHERE id = ?').get(id) as
    | MarketSourceProposal
    | undefined;
}

export function listMarketSourceProposals(
  marketId: string,
  filters?: { status?: MarketSourceProposalStatus | null },
): MarketSourceProposal[] {
  if (filters?.status) {
    return getDb()
      .prepare(
        `SELECT *
         FROM market_source_proposals
         WHERE market_id = ? AND status = ?
         ORDER BY created_at DESC, id DESC`,
      )
      .all(marketId, filters.status) as MarketSourceProposal[];
  }

  return getDb()
    .prepare('SELECT * FROM market_source_proposals WHERE market_id = ? ORDER BY created_at DESC, id DESC')
    .all(marketId) as MarketSourceProposal[];
}

export function findDuplicateMarketSourceProposal(marketId: string, url: string): MarketSourceProposal | undefined {
  return getDb()
    .prepare(
      `SELECT *
       FROM market_source_proposals
       WHERE market_id = ? AND normalized_url = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get(marketId, normalizeMarketUrl(url)) as MarketSourceProposal | undefined;
}

export function reviewMarketSourceProposal(
  id: string,
  input: { status: MarketSourceProposalStatus; source_id?: string | null; review_note?: string | null },
): MarketSourceProposal {
  const reviewedAt = now();
  const result = getDb()
    .prepare(
      `UPDATE market_source_proposals
       SET status = @status,
           source_id = @source_id,
           review_note = @review_note,
           reviewed_at = @reviewed_at,
           updated_at = @updated_at
       WHERE id = @id`,
    )
    .run({
      id,
      status: input.status,
      source_id: input.source_id ?? null,
      review_note: input.review_note ?? null,
      reviewed_at: reviewedAt,
      updated_at: reviewedAt,
    });
  if (result.changes === 0) throw new Error(`market source proposal not found: ${id}`);

  return getMarketSourceProposal(id)!;
}

export function createMarketRun(input: {
  market_id: string;
  source_id?: string | null;
  kind: MarketRunKind;
  status: MarketRunStatus;
  summary?: string | null;
}): MarketRun {
  const run: MarketRun = {
    id: id('mrun'),
    market_id: input.market_id,
    source_id: input.source_id ?? null,
    kind: input.kind,
    status: input.status,
    started_at: now(),
    completed_at: null,
    summary: input.summary ?? null,
  };

  getDb()
    .prepare(
      `INSERT INTO market_runs (id, market_id, source_id, kind, status, started_at, completed_at, summary)
       VALUES (@id, @market_id, @source_id, @kind, @status, @started_at, @completed_at, @summary)`,
    )
    .run(run);

  return run;
}

export function completeMarketRun(id: string, input: { status: MarketRunStatus; summary?: string | null }): MarketRun {
  const result = getDb()
    .prepare(
      `UPDATE market_runs
       SET status = @status, summary = @summary, completed_at = @completed_at
       WHERE id = @id`,
    )
    .run({
      id,
      status: input.status,
      summary: input.summary ?? null,
      completed_at: now(),
    });
  if (result.changes === 0) throw new Error(`market run not found: ${id}`);

  return getDb().prepare('SELECT * FROM market_runs WHERE id = ?').get(id) as MarketRun;
}

export function listMarketRuns(marketId: string): MarketRun[] {
  return getDb()
    .prepare('SELECT * FROM market_runs WHERE market_id = ? ORDER BY started_at DESC, id DESC')
    .all(marketId) as MarketRun[];
}

export function getLatestMarketRun(marketId: string): MarketRun | undefined {
  return getDb()
    .prepare('SELECT * FROM market_runs WHERE market_id = ? ORDER BY started_at DESC, id DESC LIMIT 1')
    .get(marketId) as MarketRun | undefined;
}

export function createMarketDocument(input: {
  market_id: string;
  source_id: string;
  run_id?: string | null;
  url: string;
  canonical_url?: string | null;
  title?: string | null;
  content_text: string;
  content_hash?: string | null;
  status: MarketDocumentStatus;
  error?: string | null;
  fetched_at?: string;
  metadata_json?: string | null;
}): MarketDocument {
  const at = now();
  const document: MarketDocument = {
    id: id('mdoc'),
    market_id: input.market_id,
    source_id: input.source_id,
    run_id: input.run_id ?? null,
    url: input.url,
    canonical_url: input.canonical_url ?? null,
    title: input.title ?? null,
    content_text: input.content_text,
    content_hash: input.content_hash ?? null,
    status: input.status,
    error: input.error ?? null,
    fetched_at: input.fetched_at ?? at,
    created_at: at,
    metadata_json: input.metadata_json ?? null,
  };

  getDb()
    .prepare(
      `INSERT INTO market_documents
         (id, market_id, source_id, run_id, url, canonical_url, title, content_text, content_hash, status, error, fetched_at, created_at, metadata_json)
       VALUES
         (@id, @market_id, @source_id, @run_id, @url, @canonical_url, @title, @content_text, @content_hash, @status, @error, @fetched_at, @created_at, @metadata_json)`,
    )
    .run(document);

  return document;
}

export function getMarketDocument(id: string): MarketDocument | undefined {
  return getDb().prepare('SELECT * FROM market_documents WHERE id = ?').get(id) as MarketDocument | undefined;
}

export function listMarketDocuments(marketId: string): MarketDocument[] {
  return getDb()
    .prepare('SELECT * FROM market_documents WHERE market_id = ? ORDER BY created_at DESC, id DESC')
    .all(marketId) as MarketDocument[];
}

export function findExistingFetchedMarketDocument(input: {
  source_id: string;
  canonical_url: string;
  content_hash: string;
}): MarketDocument | undefined {
  return getDb()
    .prepare(
      `SELECT *
       FROM market_documents
       WHERE source_id = ?
         AND canonical_url = ?
         AND content_hash = ?
         AND status = 'fetched'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get(input.source_id, input.canonical_url, input.content_hash) as MarketDocument | undefined;
}

export function listMarketSourcesWithLatestFailedDocument(marketId: string): MarketSource[] {
  return getDb()
    .prepare(
      `SELECT s.*
       FROM market_sources s
       JOIN market_documents d ON d.source_id = s.id
       WHERE s.market_id = ?
         AND s.status = 'active'
         AND d.id = (
           SELECT latest.id
           FROM market_documents latest
           WHERE latest.source_id = s.id
           ORDER BY latest.created_at DESC, latest.id DESC
           LIMIT 1
         )
         AND d.status = 'failed'
       ORDER BY s.created_at, s.id`,
    )
    .all(marketId) as MarketSource[];
}

const MARKET_CANDIDATE_TYPES: MarketCandidateType[] = [
  'company',
  'product',
  'problem',
  'capability',
  'category',
  'claim',
];
const MARKET_CANDIDATE_CONFIDENCES: MarketCandidateConfidence[] = ['low', 'medium', 'high'];
const MARKET_CANDIDATE_STATUSES: MarketCandidateStatus[] = ['proposed', 'accepted', 'rejected'];

function assertCandidateEvidence(marketId: string, evidence: MarketCandidateEvidence[]): void {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new Error('candidate evidence must include at least one market document');
  }

  for (const item of evidence) {
    if (!item || typeof item.document_id !== 'string' || item.document_id.trim() === '') {
      throw new Error('candidate evidence document_id is required');
    }
    const document = getMarketDocument(item.document_id);
    if (!document) {
      throw new Error(`candidate evidence document not found: ${item.document_id}`);
    }
    if (document.market_id !== marketId) {
      throw new Error(`candidate evidence document belongs to a different market: ${item.document_id}`);
    }
  }
}

function assertCandidateEnums(input: {
  candidate_type: MarketCandidateType;
  confidence: MarketCandidateConfidence;
  status?: MarketCandidateStatus;
}): void {
  if (!MARKET_CANDIDATE_TYPES.includes(input.candidate_type)) {
    throw new Error(`candidate_type must be one of: ${MARKET_CANDIDATE_TYPES.join(', ')}`);
  }
  if (!MARKET_CANDIDATE_CONFIDENCES.includes(input.confidence)) {
    throw new Error(`confidence must be one of: ${MARKET_CANDIDATE_CONFIDENCES.join(', ')}`);
  }
  if (input.status && !MARKET_CANDIDATE_STATUSES.includes(input.status)) {
    throw new Error(`status must be one of: ${MARKET_CANDIDATE_STATUSES.join(', ')}`);
  }
}

export function createMarketCandidate(input: {
  market_id: string;
  run_id?: string | null;
  candidate_type: MarketCandidateType;
  name: string;
  summary?: string | null;
  confidence: MarketCandidateConfidence;
  status?: MarketCandidateStatus;
  evidence: MarketCandidateEvidence[];
  metadata?: unknown;
}): MarketCandidate {
  assertCandidateEnums(input);
  assertCandidateEvidence(input.market_id, input.evidence);

  if (input.run_id) {
    const run = getDb().prepare('SELECT * FROM market_runs WHERE id = ?').get(input.run_id) as MarketRun | undefined;
    if (!run) throw new Error(`market run not found: ${input.run_id}`);
    if (run.market_id !== input.market_id) {
      throw new Error(`candidate run belongs to a different market: ${input.run_id}`);
    }
  }

  const at = now();
  const candidate: MarketCandidate = {
    id: id('mcand'),
    market_id: input.market_id,
    run_id: input.run_id ?? null,
    candidate_type: input.candidate_type,
    name: input.name,
    summary: input.summary ?? null,
    confidence: input.confidence,
    status: input.status ?? 'proposed',
    evidence_json: JSON.stringify(input.evidence),
    metadata_json: input.metadata === undefined || input.metadata === null ? null : JSON.stringify(input.metadata),
    review_note: null,
    created_at: at,
    updated_at: at,
    reviewed_at: null,
  };

  getDb()
    .prepare(
      `INSERT INTO market_candidates
         (id, market_id, run_id, candidate_type, name, summary, confidence, status, evidence_json, metadata_json, review_note, created_at, updated_at, reviewed_at)
       VALUES
         (@id, @market_id, @run_id, @candidate_type, @name, @summary, @confidence, @status, @evidence_json, @metadata_json, @review_note, @created_at, @updated_at, @reviewed_at)`,
    )
    .run(candidate);

  return candidate;
}

export function getMarketCandidate(id: string): MarketCandidate | undefined {
  return getDb().prepare('SELECT * FROM market_candidates WHERE id = ?').get(id) as MarketCandidate | undefined;
}

export function listMarketCandidates(
  marketId: string,
  filters?: { status?: MarketCandidateStatus | null; candidate_type?: MarketCandidateType | null },
): MarketCandidate[] {
  const clauses = ['market_id = @market_id'];
  const params: Record<string, unknown> = { market_id: marketId };
  if (filters?.status) {
    clauses.push('status = @status');
    params.status = filters.status;
  }
  if (filters?.candidate_type) {
    clauses.push('candidate_type = @candidate_type');
    params.candidate_type = filters.candidate_type;
  }

  return getDb()
    .prepare(`SELECT * FROM market_candidates WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC, id DESC`)
    .all(params) as MarketCandidate[];
}

export function reviewMarketCandidate(
  id: string,
  input: { status: MarketCandidateStatus; review_note?: string | null },
): MarketCandidate {
  if (!MARKET_CANDIDATE_STATUSES.includes(input.status)) {
    throw new Error(`status must be one of: ${MARKET_CANDIDATE_STATUSES.join(', ')}`);
  }

  const result = getDb()
    .prepare(
      `UPDATE market_candidates
       SET status = @status,
           review_note = @review_note,
           updated_at = @updated_at,
           reviewed_at = @reviewed_at
       WHERE id = @id`,
    )
    .run({
      id,
      status: input.status,
      review_note: input.review_note ?? null,
      updated_at: now(),
      reviewed_at: now(),
    });
  if (result.changes === 0) throw new Error(`market candidate not found: ${id}`);

  return getMarketCandidate(id)!;
}

export function summarizeMarketCandidates(marketId: string): MarketCandidateSummary {
  const candidates = listMarketCandidates(marketId);
  const latest_extraction_run = getDb()
    .prepare(
      `SELECT *
       FROM market_runs
       WHERE market_id = ? AND kind = 'extraction'
       ORDER BY started_at DESC, id DESC
       LIMIT 1`,
    )
    .get(marketId) as MarketRun | undefined;

  return {
    market_id: marketId,
    total: candidates.length,
    by_status: countMarketRows(candidates.map((candidate) => candidate.status)),
    by_type: countMarketRows(candidates.map((candidate) => candidate.candidate_type)),
    by_confidence: countMarketRows(candidates.map((candidate) => candidate.confidence)),
    latest_extraction_run: latest_extraction_run ?? null,
  };
}

function normalizeCandidateName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function countMarketRows<T extends string>(values: T[]): Partial<Record<T, number>> {
  return values.reduce(
    (acc, value) => {
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<T, number>>,
  );
}

export function findDuplicateMarketCandidate(
  marketId: string,
  candidateType: MarketCandidateType,
  name: string,
): MarketCandidate | undefined {
  const normalized = normalizeCandidateName(name);
  return listMarketCandidates(marketId, { candidate_type: candidateType }).find(
    (candidate) => normalizeCandidateName(candidate.name) === normalized,
  );
}
