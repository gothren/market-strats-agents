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
           AND name IN ('markets', 'market_boundaries', 'market_sources', 'market_runs')
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>;

    expect(rows.map((row) => row.name)).toEqual(['market_boundaries', 'market_runs', 'market_sources', 'markets']);
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

    marketDb.addMarketSource({
      market_id: market.id,
      url: 'https://example.com/vendor',
      source_type: 'url',
      trust_tier: 'official',
      notes: 'Vendor homepage',
    });

    marketDb.createMarketRun({
      market_id: market.id,
      kind: 'scan',
      status: 'running',
      summary: null,
    });

    getDb().prepare('DELETE FROM markets WHERE id = ?').run(market.id);

    expect(getDb().prepare('SELECT COUNT(*) AS c FROM market_boundaries').get()).toMatchObject({ c: 0 });
    expect(getDb().prepare('SELECT COUNT(*) AS c FROM market_sources').get()).toMatchObject({ c: 0 });
    expect(getDb().prepare('SELECT COUNT(*) AS c FROM market_runs').get()).toMatchObject({ c: 0 });
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

  it('stores configurable sources with trust metadata', async () => {
    const marketDb = await import('./markets.js');
    const market = marketDb.createMarket({ name: 'AI Security', description: null });

    const source = marketDb.addMarketSource({
      market_id: market.id,
      url: 'https://example.com/vendor',
      source_type: 'url',
      trust_tier: 'official',
      notes: 'Vendor homepage',
    });

    expect(source).toMatchObject({
      market_id: market.id,
      url: 'https://example.com/vendor',
      source_type: 'url',
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
        source_type: 'url',
        trust_tier: 'official',
        notes: null,
      }),
    ).toThrow(/foreign key|constraint/i);
  });

  it('records market runs so agent work is auditable', async () => {
    const marketDb = await import('./markets.js');
    const market = marketDb.createMarket({ name: 'AI Security', description: null });

    const run = marketDb.createMarketRun({
      market_id: market.id,
      kind: 'scan',
      status: 'running',
      summary: null,
    });
    expect(run).toMatchObject({
      market_id: market.id,
      kind: 'scan',
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
