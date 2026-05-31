import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { initTestDb, closeDb, runMigrations } from '../../db/index.js';
import { dispatch } from '../dispatch.js';

beforeEach(() => {
  const db = initTestDb();
  runMigrations(db);
});

afterEach(() => {
  closeDb();
});

async function registerMarketsResource(): Promise<void> {
  await import('./markets.js');
}

describe('markets CLI resource', () => {
  it('creates a market and returns agent-friendly next actions', async () => {
    await registerMarketsResource();

    const resp = await dispatch(
      {
        id: 'req-create-market',
        command: 'markets-create',
        args: {
          name: 'AI Security',
          description: 'Security products for AI systems',
        },
      },
      { caller: 'host' },
    );

    expect(resp.ok).toBe(true);
    if (resp.ok) {
      expect(resp.data).toMatchObject({
        market: {
          name: 'AI Security',
          description: 'Security products for AI systems',
          status: 'active',
        },
      });
      const data = resp.data as { market: { id: string }; next_actions: string[] };
      expect(data.market.id).toMatch(/^mkt_/);
      expect(data.next_actions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('market-boundaries update'),
          expect.stringContaining('market-sources add'),
        ]),
      );
    }
  });

  it('lists markets in a stable object envelope for tool callers', async () => {
    await registerMarketsResource();

    await dispatch(
      {
        id: 'req-create-market',
        command: 'markets-create',
        args: { name: 'AI Security', description: null },
      },
      { caller: 'host' },
    );

    const resp = await dispatch({ id: 'req-list-markets', command: 'markets-list', args: {} }, { caller: 'host' });

    expect(resp.ok).toBe(true);
    if (resp.ok) {
      expect(resp.data).toMatchObject({
        markets: [{ name: 'AI Security', status: 'active' }],
      });
    }
  });

  it('gets a market overview with boundary, sources, and latest run fields', async () => {
    await registerMarketsResource();

    const created = await dispatch(
      {
        id: 'req-create-market',
        command: 'markets-create',
        args: { name: 'AI Security', description: null },
      },
      { caller: 'host' },
    );
    expect(created.ok).toBe(true);
    const marketId = (created as { ok: true; data: { market: { id: string } } }).data.market.id;

    const resp = await dispatch(
      { id: 'req-get-market', command: 'markets-get', args: { id: marketId } },
      { caller: 'host' },
    );

    expect(resp.ok).toBe(true);
    if (resp.ok) {
      expect(resp.data).toEqual({
        market: expect.objectContaining({ id: marketId, name: 'AI Security' }),
        boundary: null,
        sources: [],
        latest_run: null,
        next_actions: expect.any(Array),
      });
    }
  });
});

describe('market boundaries CLI resource', () => {
  it('upserts the market boundary used to avoid guessing during categorization', async () => {
    await registerMarketsResource();

    const created = await dispatch(
      {
        id: 'req-create-market',
        command: 'markets-create',
        args: { name: 'AI Security', description: null },
      },
      { caller: 'host' },
    );
    expect(created.ok).toBe(true);
    const marketId = (created as { ok: true; data: { market: { id: string } } }).data.market.id;

    const resp = await dispatch(
      {
        id: 'req-boundary',
        command: 'market-boundaries-update',
        args: {
          market_id: marketId,
          inclusions: 'AI firewalls, model scanning',
          exclusions: 'Generic cloud security',
          adjacent_markets: 'AppSec, data security',
          notes: 'Initial analyst boundary',
        },
      },
      { caller: 'host' },
    );

    expect(resp.ok).toBe(true);
    if (resp.ok) {
      expect(resp.data).toMatchObject({
        boundary: {
          market_id: marketId,
          inclusions: 'AI firewalls, model scanning',
          exclusions: 'Generic cloud security',
        },
        next_actions: expect.arrayContaining([expect.stringContaining('market-sources add')]),
      });
    }
  });
});

describe('market sources CLI resource', () => {
  it('adds and lists source URLs with source type and trust tier metadata', async () => {
    await registerMarketsResource();

    const created = await dispatch(
      {
        id: 'req-create-market',
        command: 'markets-create',
        args: { name: 'AI Security', description: null },
      },
      { caller: 'host' },
    );
    expect(created.ok).toBe(true);
    const marketId = (created as { ok: true; data: { market: { id: string } } }).data.market.id;

    const added = await dispatch(
      {
        id: 'req-source-add',
        command: 'market-sources-add',
        args: {
          market_id: marketId,
          url: 'https://example.com/vendor',
          source_type: 'url',
          trust_tier: 'official',
          notes: 'Vendor homepage',
        },
      },
      { caller: 'host' },
    );

    expect(added.ok).toBe(true);
    if (added.ok) {
      expect(added.data).toMatchObject({
        source: {
          market_id: marketId,
          url: 'https://example.com/vendor',
          source_type: 'url',
          trust_tier: 'official',
          status: 'active',
        },
        next_actions: expect.arrayContaining([expect.stringContaining('markets get')]),
      });
    }

    const listed = await dispatch(
      { id: 'req-source-list', command: 'market-sources-list', args: { market_id: marketId } },
      { caller: 'host' },
    );

    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.data).toMatchObject({
        sources: [
          {
            market_id: marketId,
            url: 'https://example.com/vendor',
            trust_tier: 'official',
          },
        ],
      });
    }
  });

  it('rejects invalid source metadata before entering the handler', async () => {
    await registerMarketsResource();

    const resp = await dispatch(
      {
        id: 'req-source-invalid',
        command: 'market-sources-add',
        args: {
          market_id: 'mkt_123',
          url: 'https://example.com/vendor',
          source_type: 'url',
          trust_tier: 'made-up-tier',
        },
      },
      { caller: 'host' },
    );

    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('invalid-args');
      expect(resp.error.message).toMatch(/trust/i);
    }
  });
});
