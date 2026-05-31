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
export type MarketRunKind = 'setup' | 'collection' | 'brief';
export type MarketRunStatus = 'running' | 'completed' | 'failed';
export type MarketDocumentStatus = 'fetched' | 'failed' | 'skipped';

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

function now(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
