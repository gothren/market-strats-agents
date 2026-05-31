import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { initTestDb, closeDb, runMigrations, getDb } from './index.js';

beforeEach(() => {
  const db = initTestDb();
  runMigrations(db);
});

afterEach(() => {
  closeDb();
});

describe('market core schema', () => {
  it('creates the core market tables in migrations', () => {
    const rows = getDb()
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table'
           AND name IN ('markets', 'market_boundaries', 'market_sources', 'market_runs', 'market_documents', 'market_candidates')
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>;

    expect(rows.map((row) => row.name)).toEqual([
      'market_boundaries',
      'market_candidates',
      'market_documents',
      'market_runs',
      'market_sources',
      'markets',
    ]);
  });

  it('cascades market-owned evidence and run data when a market is deleted', async () => {
    const marketDb = await import('./markets.js');
    const market = marketDb.createMarket({
      name: 'AI Security',
      description: 'Security products for AI systems',
    });

    marketDb.upsertMarketBoundary({
      market_id: market.id,
      inclusions: 'Runtime protection, model security, AI app security',
      exclusions: 'General cloud security',
      adjacent_markets: 'AppSec, data security',
      notes: 'Initial analyst boundary',
    });

    const source = marketDb.addMarketSource({
      market_id: market.id,
      url: 'https://example.com/vendor',
      source_type: 'exact_url',
      trust_tier: 'official',
      notes: 'Vendor homepage',
    });

    const run = marketDb.createMarketRun({
      market_id: market.id,
      source_id: source.id,
      kind: 'collection',
      status: 'running',
      summary: null,
    });

    marketDb.createMarketDocument({
      market_id: market.id,
      source_id: source.id,
      run_id: run.id,
      url: source.url,
      canonical_url: source.url,
      title: 'Vendor homepage',
      content_text: 'Vendor protects AI applications from prompt injection.',
      content_hash: 'sha256:vendor-homepage',
      status: 'fetched',
      error: null,
      metadata_json: JSON.stringify({ content_type: 'text/html' }),
    });

    getDb().prepare('DELETE FROM markets WHERE id = ?').run(market.id);

    expect(getDb().prepare('SELECT COUNT(*) AS c FROM market_boundaries').get()).toMatchObject({ c: 0 });
    expect(getDb().prepare('SELECT COUNT(*) AS c FROM market_candidates').get()).toMatchObject({ c: 0 });
    expect(getDb().prepare('SELECT COUNT(*) AS c FROM market_documents').get()).toMatchObject({ c: 0 });
    expect(getDb().prepare('SELECT COUNT(*) AS c FROM market_sources').get()).toMatchObject({ c: 0 });
    expect(getDb().prepare('SELECT COUNT(*) AS c FROM market_runs').get()).toMatchObject({ c: 0 });
  });
});

describe('market candidate db helpers', () => {
  async function createFetchedDocument() {
    const marketDb = await import('./markets.js');
    const market = marketDb.createMarket({ name: `AI Security ${Math.random()}`, description: null });
    const source = marketDb.addMarketSource({
      market_id: market.id,
      url: `https://example.com/vendor-${Math.random()}`,
      source_type: 'exact_url',
      trust_tier: 'official',
      notes: 'Vendor homepage',
    });
    const run = marketDb.createMarketRun({
      market_id: market.id,
      source_id: source.id,
      kind: 'collection',
      status: 'completed',
      summary: null,
    });
    const document = marketDb.createMarketDocument({
      market_id: market.id,
      source_id: source.id,
      run_id: run.id,
      url: source.url,
      canonical_url: source.url,
      title: 'Vendor homepage',
      content_text: 'Vendor protects AI applications from prompt injection.',
      content_hash: 'sha256:vendor-homepage',
      status: 'fetched',
      error: null,
      metadata_json: JSON.stringify({ content_type: 'text/html' }),
    });

    return { marketDb, market, document };
  }

  it('stores typed proposed candidates with evidence links to market documents', async () => {
    const { marketDb, market, document } = await createFetchedDocument();
    const run = marketDb.createMarketRun({
      market_id: market.id,
      source_id: null,
      kind: 'extraction',
      status: 'completed',
      summary: null,
    });

    const candidate = marketDb.createMarketCandidate({
      market_id: market.id,
      run_id: run.id,
      candidate_type: 'company',
      name: 'Example Vendor',
      summary: 'Provides runtime protection for AI applications.',
      confidence: 'medium',
      evidence: [
        {
          document_id: document.id,
          quote: 'Vendor protects AI applications from prompt injection.',
          note: 'Vendor positioning statement',
        },
      ],
      metadata: { source: 'agent-extraction' },
    });

    expect(candidate).toMatchObject({
      market_id: market.id,
      run_id: run.id,
      candidate_type: 'company',
      name: 'Example Vendor',
      summary: 'Provides runtime protection for AI applications.',
      confidence: 'medium',
      status: 'proposed',
      review_note: null,
      reviewed_at: null,
    });
    expect(candidate.id).toMatch(/^mcand_/);
    expect(JSON.parse(candidate.evidence_json)).toEqual([
      {
        document_id: document.id,
        quote: 'Vendor protects AI applications from prompt injection.',
        note: 'Vendor positioning statement',
      },
    ]);
    expect(JSON.parse(candidate.metadata_json!)).toEqual({ source: 'agent-extraction' });
    expect(marketDb.getMarketCandidate(candidate.id)).toEqual(candidate);
    expect(marketDb.listMarketCandidates(market.id)).toEqual([candidate]);
  });

  it('requires candidate evidence so extracted intelligence is not unsupported', async () => {
    const { marketDb, market } = await createFetchedDocument();

    expect(() =>
      marketDb.createMarketCandidate({
        market_id: market.id,
        run_id: null,
        candidate_type: 'company',
        name: 'Unsupported Vendor',
        summary: null,
        confidence: 'low',
        evidence: [],
        metadata: null,
      }),
    ).toThrow(/evidence/i);
  });

  it('rejects evidence documents from a different market', async () => {
    const { marketDb, market } = await createFetchedDocument();
    const other = await createFetchedDocument();

    expect(() =>
      marketDb.createMarketCandidate({
        market_id: market.id,
        run_id: null,
        candidate_type: 'company',
        name: 'Cross Market Vendor',
        summary: null,
        confidence: 'low',
        evidence: [{ document_id: other.document.id, quote: 'Other market evidence', note: null }],
        metadata: null,
      }),
    ).toThrow(/document.*market/i);
  });

  it('reviews candidates by updating status, note, and reviewed timestamp', async () => {
    const { marketDb, market, document } = await createFetchedDocument();
    const candidate = marketDb.createMarketCandidate({
      market_id: market.id,
      run_id: null,
      candidate_type: 'capability',
      name: 'Prompt injection detection',
      summary: 'Detects and blocks prompt injection attempts.',
      confidence: 'high',
      evidence: [{ document_id: document.id, quote: 'prompt injection', note: null }],
      metadata: null,
    });

    const reviewed = marketDb.reviewMarketCandidate(candidate.id, {
      status: 'accepted',
      review_note: 'Evidence supports this capability.',
    });

    expect(reviewed).toMatchObject({
      id: candidate.id,
      status: 'accepted',
      review_note: 'Evidence supports this capability.',
      reviewed_at: expect.any(String),
    });
  });

  it('filters candidates and summarizes review state for a market', async () => {
    const { marketDb, market, document } = await createFetchedDocument();
    const run = marketDb.createMarketRun({
      market_id: market.id,
      source_id: null,
      kind: 'extraction',
      status: 'completed',
      summary: null,
    });
    const capability = marketDb.createMarketCandidate({
      market_id: market.id,
      run_id: run.id,
      candidate_type: 'capability',
      name: 'Prompt injection detection',
      summary: null,
      confidence: 'high',
      evidence: [{ document_id: document.id, quote: 'prompt injection', note: null }],
      metadata: null,
    });
    marketDb.createMarketCandidate({
      market_id: market.id,
      run_id: run.id,
      candidate_type: 'company',
      name: 'Example Vendor',
      summary: null,
      confidence: 'medium',
      evidence: [{ document_id: document.id, quote: 'Vendor', note: null }],
      metadata: null,
    });
    marketDb.reviewMarketCandidate(capability.id, {
      status: 'accepted',
      review_note: 'Accepted by user review.',
    });

    expect(marketDb.listMarketCandidates(market.id, { status: 'accepted', candidate_type: 'capability' })).toEqual([
      expect.objectContaining({ id: capability.id, status: 'accepted', candidate_type: 'capability' }),
    ]);
    expect(marketDb.summarizeMarketCandidates(market.id)).toMatchObject({
      market_id: market.id,
      total: 2,
      by_status: { accepted: 1, proposed: 1 },
      by_type: { capability: 1, company: 1 },
      by_confidence: { high: 1, medium: 1 },
      latest_extraction_run: {
        id: run.id,
        status: 'completed',
        started_at: expect.any(String),
        completed_at: null,
      },
    });
  });

  it('finds duplicate candidates by normalized market, type, and name', async () => {
    const { marketDb, market, document } = await createFetchedDocument();
    const candidate = marketDb.createMarketCandidate({
      market_id: market.id,
      run_id: null,
      candidate_type: 'company',
      name: 'Example Vendor',
      summary: null,
      confidence: 'medium',
      evidence: [{ document_id: document.id, quote: 'Vendor', note: null }],
      metadata: null,
    });

    expect(marketDb.findDuplicateMarketCandidate(market.id, 'company', '  example   vendor  ')).toMatchObject({
      id: candidate.id,
    });
    expect(marketDb.findDuplicateMarketCandidate(market.id, 'product', 'example vendor')).toBeUndefined();
  });
});

describe('market core db helpers', () => {
  it('creates, retrieves, lists, and updates markets', async () => {
    const marketDb = await import('./markets.js');
    const market = marketDb.createMarket({
      name: 'AI Security',
      description: 'Security products for AI systems',
    });

    expect(market).toMatchObject({
      name: 'AI Security',
      description: 'Security products for AI systems',
      status: 'active',
    });
    expect(market.id).toMatch(/^mkt_/);
    expect(market.created_at).toEqual(expect.any(String));
    expect(market.updated_at).toEqual(expect.any(String));

    expect(marketDb.getMarket(market.id)).toMatchObject({ id: market.id, name: 'AI Security' });
    expect(marketDb.getMarketByName('AI Security')).toMatchObject({ id: market.id });
    expect(marketDb.listMarkets()).toHaveLength(1);

    marketDb.updateMarket(market.id, { description: 'Updated scope', status: 'archived' });
    expect(marketDb.getMarket(market.id)).toMatchObject({
      id: market.id,
      description: 'Updated scope',
      status: 'archived',
    });
  });

  it('keeps market names unique for stable agent lookups', async () => {
    const marketDb = await import('./markets.js');
    marketDb.createMarket({ name: 'AI Security', description: null });

    expect(() => marketDb.createMarket({ name: 'AI Security', description: null })).toThrow(/unique|constraint/i);
  });

  it('upserts a market boundary document used for later recategorization', async () => {
    const marketDb = await import('./markets.js');
    const market = marketDb.createMarket({ name: 'AI Security', description: null });

    const first = marketDb.upsertMarketBoundary({
      market_id: market.id,
      inclusions: 'AI firewalls',
      exclusions: 'Legacy SIEM',
      adjacent_markets: 'AppSec',
      notes: 'Initial boundary',
    });
    expect(first).toMatchObject({ market_id: market.id, inclusions: 'AI firewalls' });

    const updated = marketDb.upsertMarketBoundary({
      market_id: market.id,
      inclusions: 'AI firewalls, model scanning',
      exclusions: 'Legacy SIEM',
      adjacent_markets: 'AppSec, cloud security',
      notes: 'Expanded after review',
    });

    expect(updated).toMatchObject({
      market_id: market.id,
      inclusions: 'AI firewalls, model scanning',
      notes: 'Expanded after review',
    });
    expect(marketDb.getMarketBoundary(market.id)).toMatchObject(updated);
  });

  it('stores configurable research surfaces with explicit source type and trust metadata', async () => {
    const marketDb = await import('./markets.js');
    const market = marketDb.createMarket({ name: 'AI Security', description: null });

    const source = marketDb.addMarketSource({
      market_id: market.id,
      url: 'https://docs.example.com',
      source_type: 'docs',
      trust_tier: 'official',
      notes: 'Vendor documentation root',
    });

    expect(source).toMatchObject({
      market_id: market.id,
      url: 'https://docs.example.com',
      source_type: 'docs',
      trust_tier: 'official',
      status: 'active',
    });
    expect(marketDb.listMarketSources(market.id)).toEqual([source]);
  });

  it('rejects sources for unknown markets', async () => {
    const marketDb = await import('./markets.js');
    expect(() =>
      marketDb.addMarketSource({
        market_id: 'mkt_missing',
        url: 'https://example.com/vendor',
        source_type: 'exact_url',
        trust_tier: 'official',
        notes: null,
      }),
    ).toThrow(/foreign key|constraint/i);
  });

  it('rejects generic url source type so callers choose an explicit research surface', async () => {
    const marketDb = await import('./markets.js');
    const market = marketDb.createMarket({ name: 'AI Security', description: null });

    expect(() =>
      marketDb.addMarketSource({
        market_id: market.id,
        url: 'https://example.com/vendor',
        source_type: 'url',
        trust_tier: 'official',
        notes: null,
      }),
    ).toThrow(/source/i);
  });

  it('records market runs so agent work is auditable', async () => {
    const marketDb = await import('./markets.js');
    const market = marketDb.createMarket({ name: 'AI Security', description: null });

    const run = marketDb.createMarketRun({
      market_id: market.id,
      source_id: null,
      kind: 'collection',
      status: 'running',
      summary: null,
    });
    expect(run).toMatchObject({
      market_id: market.id,
      source_id: null,
      kind: 'collection',
      status: 'running',
      summary: null,
    });

    const completed = marketDb.completeMarketRun(run.id, {
      status: 'completed',
      summary: 'Found 3 initial vendors',
    });
    expect(completed).toMatchObject({
      id: run.id,
      status: 'completed',
      summary: 'Found 3 initial vendors',
    });
    expect(completed.completed_at).toEqual(expect.any(String));
    expect(marketDb.listMarketRuns(market.id)).toEqual([completed]);
  });
});

describe('market document db helpers', () => {
  it('stores one market document per retrieved content unit from the same source run', async () => {
    const marketDb = await import('./markets.js');
    const market = marketDb.createMarket({ name: 'AI Security', description: null });
    const source = marketDb.addMarketSource({
      market_id: market.id,
      url: 'https://docs.example.com',
      source_type: 'docs',
      trust_tier: 'official',
      notes: 'Vendor documentation root',
    });
    const run = marketDb.createMarketRun({
      market_id: market.id,
      source_id: source.id,
      kind: 'collection',
      status: 'running',
      summary: null,
    });

    const root = marketDb.createMarketDocument({
      market_id: market.id,
      source_id: source.id,
      run_id: run.id,
      url: 'https://docs.example.com/',
      canonical_url: 'https://docs.example.com/',
      title: 'Vendor Docs',
      content_text: 'Vendor documentation root.',
      content_hash: 'sha256:docs-root',
      status: 'fetched',
      error: null,
      metadata_json: JSON.stringify({ content_type: 'text/html', depth: 0 }),
    });
    const promptInjection = marketDb.createMarketDocument({
      market_id: market.id,
      source_id: source.id,
      run_id: run.id,
      url: 'https://docs.example.com/security/prompt-injection',
      canonical_url: 'https://docs.example.com/security/prompt-injection',
      title: 'Prompt Injection Protection',
      content_text: 'Controls for detecting and blocking prompt injection.',
      content_hash: 'sha256:prompt-injection',
      status: 'fetched',
      error: null,
      metadata_json: JSON.stringify({ content_type: 'text/html', depth: 1 }),
    });

    const documents = marketDb.listMarketDocuments(market.id);
    expect(documents).toHaveLength(2);
    expect(documents).toEqual(expect.arrayContaining([root, promptInjection]));
  });

  it('stores, retrieves, and lists fetched source documents with provenance', async () => {
    const marketDb = await import('./markets.js');
    const market = marketDb.createMarket({ name: 'AI Security', description: null });
    const source = marketDb.addMarketSource({
      market_id: market.id,
      url: 'https://example.com/vendor',
      source_type: 'exact_url',
      trust_tier: 'official',
      notes: 'Vendor homepage',
    });
    const run = marketDb.createMarketRun({
      market_id: market.id,
      source_id: source.id,
      kind: 'collection',
      status: 'running',
      summary: null,
    });

    const document = marketDb.createMarketDocument({
      market_id: market.id,
      source_id: source.id,
      run_id: run.id,
      url: source.url,
      canonical_url: source.url,
      title: 'Vendor homepage',
      content_text: 'Vendor protects AI applications from prompt injection.',
      content_hash: 'sha256:vendor-homepage',
      status: 'fetched',
      error: null,
      metadata_json: JSON.stringify({ content_type: 'text/html' }),
    });

    expect(document).toMatchObject({
      market_id: market.id,
      source_id: source.id,
      run_id: run.id,
      url: source.url,
      canonical_url: source.url,
      title: 'Vendor homepage',
      content_text: 'Vendor protects AI applications from prompt injection.',
      content_hash: 'sha256:vendor-homepage',
      status: 'fetched',
      error: null,
      metadata_json: JSON.stringify({ content_type: 'text/html' }),
    });
    expect(document.id).toMatch(/^mdoc_/);
    expect(document.fetched_at).toEqual(expect.any(String));
    expect(document.created_at).toEqual(expect.any(String));

    expect(marketDb.getMarketDocument(document.id)).toEqual(document);
    expect(marketDb.listMarketDocuments(market.id)).toEqual([document]);
  });

  it('stores failed fetch attempts so absence of evidence is auditable', async () => {
    const marketDb = await import('./markets.js');
    const market = marketDb.createMarket({ name: 'AI Security', description: null });
    const source = marketDb.addMarketSource({
      market_id: market.id,
      url: 'https://example.com/broken',
      source_type: 'exact_url',
      trust_tier: 'trusted',
      notes: null,
    });

    const document = marketDb.createMarketDocument({
      market_id: market.id,
      source_id: source.id,
      run_id: null,
      url: source.url,
      canonical_url: source.url,
      title: null,
      content_text: '',
      content_hash: null,
      status: 'failed',
      error: 'HTTP 500',
      metadata_json: JSON.stringify({ content_type: 'text/html' }),
    });

    expect(document).toMatchObject({
      market_id: market.id,
      source_id: source.id,
      run_id: null,
      url: source.url,
      canonical_url: source.url,
      title: null,
      content_text: '',
      content_hash: null,
      status: 'failed',
      error: 'HTTP 500',
      metadata_json: JSON.stringify({ content_type: 'text/html' }),
    });
    expect(marketDb.listMarketDocuments(market.id)).toEqual([document]);
  });

  it('finds sources whose latest document failed for retry workflows', async () => {
    const marketDb = await import('./markets.js');
    const market = marketDb.createMarket({ name: 'AI Security', description: null });
    const failedSource = marketDb.addMarketSource({
      market_id: market.id,
      url: 'https://example.com/broken',
      source_type: 'exact_url',
      trust_tier: 'trusted',
      notes: null,
    });
    const okSource = marketDb.addMarketSource({
      market_id: market.id,
      url: 'https://example.com/ok',
      source_type: 'exact_url',
      trust_tier: 'official',
      notes: null,
    });

    marketDb.createMarketDocument({
      market_id: market.id,
      source_id: failedSource.id,
      run_id: null,
      url: failedSource.url,
      canonical_url: failedSource.url,
      title: null,
      content_text: '',
      content_hash: null,
      status: 'failed',
      error: 'HTTP 500',
      metadata_json: null,
    });
    marketDb.createMarketDocument({
      market_id: market.id,
      source_id: okSource.id,
      run_id: null,
      url: okSource.url,
      canonical_url: okSource.url,
      title: 'OK',
      content_text: 'ok',
      content_hash: 'sha256:ok',
      status: 'fetched',
      error: null,
      metadata_json: null,
    });

    expect(marketDb.listMarketSourcesWithLatestFailedDocument(market.id)).toEqual([failedSource]);
  });

  it('rejects documents for unknown markets and sources', async () => {
    const marketDb = await import('./markets.js');

    expect(() =>
      marketDb.createMarketDocument({
        market_id: 'mkt_missing',
        source_id: 'msrc_missing',
        run_id: null,
        url: 'https://example.com/vendor',
        canonical_url: 'https://example.com/vendor',
        title: null,
        content_text: 'untrusted content',
        content_hash: 'sha256:missing',
        status: 'fetched',
        error: null,
        metadata_json: null,
      }),
    ).toThrow(/foreign key|constraint/i);
  });
});
