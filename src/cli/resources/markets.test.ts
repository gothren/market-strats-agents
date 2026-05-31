import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { initTestDb, closeDb, runMigrations } from '../../db/index.js';
import { dispatch } from '../dispatch.js';

beforeEach(() => {
  const db = initTestDb();
  runMigrations(db);
});

afterEach(() => {
  vi.unstubAllGlobals();
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
  it('adds and lists research surfaces with explicit source type and trust tier metadata', async () => {
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
          url: 'https://docs.example.com',
          source_type: 'docs',
          trust_tier: 'official',
          notes: 'Vendor documentation root',
        },
      },
      { caller: 'host' },
    );

    expect(added.ok).toBe(true);
    if (added.ok) {
      expect(added.data).toMatchObject({
        source: {
          market_id: marketId,
          url: 'https://docs.example.com',
          source_type: 'docs',
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
            url: 'https://docs.example.com',
            source_type: 'docs',
            trust_tier: 'official',
          },
        ],
      });
    }
  });

  it('rejects invalid source metadata before entering the handler', async () => {
    await registerMarketsResource();

    const genericUrl = await dispatch(
      {
        id: 'req-source-generic-url',
        command: 'market-sources-add',
        args: {
          market_id: 'mkt_123',
          url: 'https://example.com/vendor',
          source_type: 'url',
          trust_tier: 'official',
        },
      },
      { caller: 'host' },
    );

    expect(genericUrl.ok).toBe(false);
    if (!genericUrl.ok) {
      expect(genericUrl.error.code).toBe('invalid-args');
      expect(genericUrl.error.message).toMatch(/source/i);
    }

    const madeUp = await dispatch(
      {
        id: 'req-source-invalid',
        command: 'market-sources-add',
        args: {
          market_id: 'mkt_123',
          url: 'https://example.com/vendor',
          source_type: 'made-up-type',
          trust_tier: 'made-up-tier',
        },
      },
      { caller: 'host' },
    );

    expect(madeUp.ok).toBe(false);
    if (!madeUp.ok) {
      expect(madeUp.error.code).toBe('invalid-args');
      expect(madeUp.error.message).toMatch(/source|trust/i);
    }
  });

  it('collects exact_url sources into one market document per retrieved artifact', async () => {
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
          source_type: 'exact_url',
          trust_tier: 'official',
          notes: 'Vendor homepage',
        },
      },
      { caller: 'host' },
    );
    expect(added.ok).toBe(true);
    const sourceId = (added as { ok: true; data: { source: { id: string } } }).data.source.id;

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            '<html><head><title>Vendor homepage</title></head><body>Vendor protects AI applications from prompt injection.</body></html>',
            { status: 200, headers: { 'content-type': 'text/html' } },
          ),
        ),
    );

    const fetched = await dispatch(
      {
        id: 'req-sources-fetch',
        command: 'market-sources-collect',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );

    expect(fetched.ok).toBe(true);
    if (fetched.ok) {
      expect(fetched.data).toMatchObject({
        run: {
          market_id: marketId,
          kind: 'collection',
          status: 'completed',
        },
        stored_documents: [
          {
            source_id: sourceId,
            url: 'https://example.com/vendor',
            status: 'fetched',
            document_id: expect.stringMatching(/^mdoc_/),
          },
        ],
        failed: [],
        unsupported: [],
        summary: {
          visited: 1,
          stored_documents: 1,
          skipped: 0,
          failed: 0,
          unsupported: 0,
        },
        documents: [
          {
            market_id: marketId,
            source_id: sourceId,
            url: 'https://example.com/vendor',
            canonical_url: 'https://example.com/vendor',
            title: 'Vendor homepage',
            content_hash: expect.stringMatching(/^sha256:/),
            status: 'fetched',
          },
        ],
        next_actions: expect.arrayContaining([
          expect.stringContaining('market-documents list'),
          expect.stringContaining('markets get'),
        ]),
      });
    }

    expect(fetch).toHaveBeenCalledWith('https://example.com/vendor', expect.any(Object));
  });

  it('records failed exact_url collection attempts instead of silently dropping them', async () => {
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
          url: 'https://example.com/broken',
          source_type: 'exact_url',
          trust_tier: 'trusted',
          notes: null,
        },
      },
      { caller: 'host' },
    );
    expect(added.ok).toBe(true);
    const sourceId = (added as { ok: true; data: { source: { id: string } } }).data.source.id;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('server error', { status: 500, statusText: 'Server Error' })),
    );

    const fetched = await dispatch(
      {
        id: 'req-sources-fetch-failed',
        command: 'market-sources-collect',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );

    expect(fetched.ok).toBe(true);
    if (fetched.ok) {
      expect(fetched.data).toMatchObject({
        run: {
          market_id: marketId,
          kind: 'collection',
          status: 'completed',
        },
        stored_documents: [],
        failed: [
          {
            source_id: sourceId,
            url: 'https://example.com/broken',
            status: 'failed',
            error: expect.stringContaining('HTTP 500'),
            document_id: expect.stringMatching(/^mdoc_/),
          },
        ],
        unsupported: [],
        summary: {
          visited: 1,
          stored_documents: 0,
          skipped: 0,
          failed: 1,
          unsupported: 0,
        },
        documents: [
          {
            market_id: marketId,
            source_id: sourceId,
            url: 'https://example.com/broken',
            canonical_url: 'https://example.com/broken',
            title: null,
            content_text: '',
            content_hash: null,
            status: 'failed',
            error: expect.stringContaining('HTTP 500'),
          },
        ],
      });
    }
  });

  it('reports unsupported research surfaces instead of treating them as exact URL fetches', async () => {
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
          url: 'https://docs.example.com',
          source_type: 'docs',
          trust_tier: 'official',
          notes: 'Vendor documentation root',
        },
      },
      { caller: 'host' },
    );
    expect(added.ok).toBe(true);
    const sourceId = (added as { ok: true; data: { source: { id: string } } }).data.source.id;

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const collected = await dispatch(
      {
        id: 'req-sources-collect-unsupported',
        command: 'market-sources-collect',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );

    expect(collected.ok).toBe(true);
    if (collected.ok) {
      expect(collected.data).toMatchObject({
        run: {
          market_id: marketId,
          kind: 'collection',
          status: 'completed',
        },
        stored_documents: [],
        failed: [],
        unsupported: [
          {
            source_id: sourceId,
            source_type: 'docs',
            url: 'https://docs.example.com',
            reason: expect.stringContaining('unsupported'),
          },
        ],
        summary: {
          visited: 0,
          stored_documents: 0,
          skipped: 0,
          failed: 0,
          unsupported: 1,
        },
        documents: [],
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('market documents CLI resource', () => {
  it('lists and gets stored documents for agent review without re-fetching sources', async () => {
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
          source_type: 'exact_url',
          trust_tier: 'official',
          notes: 'Vendor homepage',
        },
      },
      { caller: 'host' },
    );
    expect(added.ok).toBe(true);

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            '<html><head><title>Vendor homepage</title></head><body>Vendor protects AI applications from prompt injection.</body></html>',
            { status: 200, headers: { 'content-type': 'text/html' } },
          ),
        ),
    );

    const fetched = await dispatch(
      { id: 'req-sources-collect', command: 'market-sources-collect', args: { market_id: marketId } },
      { caller: 'host' },
    );
    expect(fetched.ok).toBe(true);
    const documentId = (fetched as { ok: true; data: { documents: Array<{ id: string }> } }).data.documents[0].id;

    const listed = await dispatch(
      { id: 'req-documents-list', command: 'market-documents-list', args: { market_id: marketId } },
      { caller: 'host' },
    );

    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.data).toMatchObject({
        documents: [
          {
            id: documentId,
            market_id: marketId,
            url: 'https://example.com/vendor',
            canonical_url: 'https://example.com/vendor',
            title: 'Vendor homepage',
            status: 'fetched',
          },
        ],
        next_actions: expect.arrayContaining([expect.stringContaining('market-documents get')]),
      });
    }

    const got = await dispatch(
      { id: 'req-documents-get', command: 'market-documents-get', args: { id: documentId } },
      { caller: 'host' },
    );

    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.data).toMatchObject({
        document: {
          id: documentId,
          market_id: marketId,
          url: 'https://example.com/vendor',
          canonical_url: 'https://example.com/vendor',
          title: 'Vendor homepage',
          content_text: expect.stringContaining('prompt injection'),
          content_hash: expect.stringMatching(/^sha256:/),
          status: 'fetched',
        },
        next_actions: expect.arrayContaining([expect.stringContaining('markets get')]),
      });
    }
  });

  it('requires market_id when listing documents', async () => {
    await registerMarketsResource();

    const resp = await dispatch(
      { id: 'req-documents-list-invalid', command: 'market-documents-list', args: {} },
      { caller: 'host' },
    );

    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('invalid-args');
      expect(resp.error.message).toMatch(/market_id/i);
    }
  });
});
