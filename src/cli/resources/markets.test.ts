import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

function writePayload(payload: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'market-candidates-'));
  const file = join(dir, 'payload.json');
  writeFileSync(file, JSON.stringify(payload), 'utf8');
  return file;
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

    expect(fetch).toHaveBeenCalledWith('https://example.com/vendor', {
      headers: expect.objectContaining({
        Accept: expect.stringContaining('text/html'),
        'Accept-Language': expect.stringContaining('en-US'),
        'User-Agent': expect.stringContaining('Mozilla/5.0'),
      }),
      redirect: 'follow',
    });
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

  it('failed-only collection retries only sources whose latest document failed', async () => {
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

    const failedSource = await dispatch(
      {
        id: 'req-source-add-failed',
        command: 'market-sources-add',
        args: {
          market_id: marketId,
          url: 'https://example.com/broken',
          source_type: 'exact_url',
          trust_tier: 'trusted',
        },
      },
      { caller: 'host' },
    );
    const okSource = await dispatch(
      {
        id: 'req-source-add-ok',
        command: 'market-sources-add',
        args: {
          market_id: marketId,
          url: 'https://example.com/ok',
          source_type: 'exact_url',
          trust_tier: 'official',
        },
      },
      { caller: 'host' },
    );
    expect(failedSource.ok).toBe(true);
    expect(okSource.ok).toBe(true);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('broken')) {
          return new Response('server error', { status: 500, statusText: 'Server Error' });
        }
        return new Response('<html><head><title>OK</title></head><body>ok content</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }),
    );

    const firstCollect = await dispatch(
      { id: 'req-collect-first', command: 'market-sources-collect', args: { market_id: marketId } },
      { caller: 'host' },
    );
    expect(firstCollect.ok).toBe(true);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        return new Response(`<html><head><title>Retry</title></head><body>retried ${url}</body></html>`, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }),
    );

    const retry = await dispatch(
      {
        id: 'req-collect-failed-only',
        command: 'market-sources-collect',
        args: { market_id: marketId, 'failed-only': true },
      },
      { caller: 'host' },
    );

    expect(retry.ok).toBe(true);
    if (retry.ok) {
      expect(retry.data).toMatchObject({
        summary: {
          visited: 1,
          stored_documents: 1,
          skipped: 0,
          failed: 0,
          unsupported: 0,
        },
        stored_documents: [{ url: 'https://example.com/broken', status: 'fetched' }],
      });
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://example.com/broken', expect.any(Object));
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

  it('lists documents in compact mode without large content fields', async () => {
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

    await dispatch(
      {
        id: 'req-source-add',
        command: 'market-sources-add',
        args: {
          market_id: marketId,
          url: 'https://example.com/vendor',
          source_type: 'exact_url',
          trust_tier: 'official',
        },
      },
      { caller: 'host' },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html><head><title>Vendor homepage</title></head><body>Long document body.</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );
    await dispatch(
      { id: 'req-collect', command: 'market-sources-collect', args: { market_id: marketId } },
      { caller: 'host' },
    );

    const listed = await dispatch(
      {
        id: 'req-documents-list-compact',
        command: 'market-documents-list',
        args: { market_id: marketId, compact: true },
      },
      { caller: 'host' },
    );

    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const data = listed.data as { documents: Array<Record<string, unknown>> };
      expect(data.documents[0]).toMatchObject({
        title: 'Vendor homepage',
        status: 'fetched',
        error: null,
        url: 'https://example.com/vendor',
        canonical_url: 'https://example.com/vendor',
      });
      expect(data.documents[0].content_text).toBeUndefined();
      expect(data.documents[0].content_hash).toBeUndefined();
      expect(data.documents[0].metadata_json).toBeUndefined();
      expect(data.documents[0].created_at).toBeUndefined();
      expect(data.documents[0].fetched_at).toBeUndefined();
    }
  });
});

describe('market candidates CLI resource', () => {
  async function createDocumentFixture() {
    await registerMarketsResource();

    const created = await dispatch(
      {
        id: 'req-create-market',
        command: 'markets-create',
        args: { name: `AI Security ${Math.random()}`, description: null },
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
          url: `https://example.com/vendor-${Math.random()}`,
          source_type: 'exact_url',
          trust_tier: 'official',
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

    const collected = await dispatch(
      { id: 'req-sources-collect', command: 'market-sources-collect', args: { market_id: marketId } },
      { caller: 'host' },
    );
    expect(collected.ok).toBe(true);
    const documentId = (collected as { ok: true; data: { documents: Array<{ id: string }> } }).data.documents[0].id;

    return { marketId, documentId };
  }

  it('imports typed extraction candidates from a batch JSON payload file', async () => {
    const { marketId, documentId } = await createDocumentFixture();
    const payloadFile = writePayload({
      document_ids: [documentId],
      candidates: [
        {
          candidate_type: 'company',
          name: 'Example Vendor',
          summary: 'Provides runtime protection for AI applications.',
          confidence: 'medium',
          evidence: [
            {
              document_id: documentId,
              quote: 'Vendor protects AI applications from prompt injection.',
              note: 'Vendor positioning statement',
            },
          ],
          metadata: { source: 'agent-extraction' },
        },
      ],
    });

    const imported = await dispatch(
      {
        id: 'req-candidates-import',
        command: 'market-candidates-import',
        args: { market_id: marketId, 'payload-file': payloadFile },
      },
      { caller: 'host' },
    );

    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.data).toMatchObject({
        run: {
          market_id: marketId,
          kind: 'extraction',
          status: 'completed',
        },
        summary: {
          imported: 1,
          by_type: { company: 1 },
          by_confidence: { medium: 1 },
        },
        candidates: [
          {
            market_id: marketId,
            candidate_type: 'company',
            name: 'Example Vendor',
            confidence: 'medium',
            status: 'proposed',
          },
        ],
        next_actions: expect.arrayContaining([expect.stringContaining('market-candidates list')]),
      });
    }
  });

  it('rejects candidate import when evidence is missing', async () => {
    const { marketId } = await createDocumentFixture();
    const payloadFile = writePayload({
      candidates: [
        {
          candidate_type: 'company',
          name: 'Unsupported Vendor',
          confidence: 'low',
          evidence: [],
        },
      ],
    });

    const imported = await dispatch(
      {
        id: 'req-candidates-import-missing-evidence',
        command: 'market-candidates-import',
        args: { market_id: marketId, 'payload-file': payloadFile },
      },
      { caller: 'host' },
    );

    expect(imported.ok).toBe(false);
    if (!imported.ok) {
      expect(imported.error.code).toBe('handler-error');
      expect(imported.error.message).toMatch(/evidence/i);
    }
  });

  it('rejects candidate import with cross-market evidence', async () => {
    const { marketId } = await createDocumentFixture();
    const other = await createDocumentFixture();
    const payloadFile = writePayload({
      candidates: [
        {
          candidate_type: 'company',
          name: 'Cross Market Vendor',
          confidence: 'low',
          evidence: [{ document_id: other.documentId, quote: 'Other market evidence', note: null }],
        },
      ],
    });

    const imported = await dispatch(
      {
        id: 'req-candidates-import-cross-market',
        command: 'market-candidates-import',
        args: { market_id: marketId, 'payload-file': payloadFile },
      },
      { caller: 'host' },
    );

    expect(imported.ok).toBe(false);
    if (!imported.ok) {
      expect(imported.error.code).toBe('handler-error');
      expect(imported.error.message).toMatch(/document.*market/i);
    }
  });

  it('lists, gets, and reviews imported candidates', async () => {
    const { marketId, documentId } = await createDocumentFixture();
    const payloadFile = writePayload({
      candidates: [
        {
          candidate_type: 'capability',
          name: 'Prompt injection detection',
          summary: 'Detects and blocks prompt injection attempts.',
          confidence: 'high',
          evidence: [{ document_id: documentId, quote: 'prompt injection', note: null }],
        },
      ],
    });

    const imported = await dispatch(
      {
        id: 'req-candidates-import-review',
        command: 'market-candidates-import',
        args: { market_id: marketId, 'payload-file': payloadFile },
      },
      { caller: 'host' },
    );
    expect(imported.ok).toBe(true);
    const candidateId = (imported as { ok: true; data: { candidates: Array<{ id: string }> } }).data.candidates[0].id;

    const listed = await dispatch(
      { id: 'req-candidates-list', command: 'market-candidates-list', args: { market_id: marketId } },
      { caller: 'host' },
    );
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.data).toMatchObject({
        candidates: [{ id: candidateId, candidate_type: 'capability', status: 'proposed' }],
        next_actions: expect.arrayContaining([expect.stringContaining('market-candidates get')]),
      });
    }

    const got = await dispatch(
      { id: 'req-candidates-get', command: 'market-candidates-get', args: { id: candidateId } },
      { caller: 'host' },
    );
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.data).toMatchObject({
        candidate: {
          id: candidateId,
          market_id: marketId,
          name: 'Prompt injection detection',
          evidence: [{ document_id: documentId, quote: 'prompt injection', note: null }],
        },
      });
    }

    const reviewed = await dispatch(
      {
        id: 'req-candidates-review',
        command: 'market-candidates-review',
        args: { id: candidateId, status: 'accepted', 'review-note': 'Evidence supports this capability.' },
      },
      { caller: 'host' },
    );
    expect(reviewed.ok).toBe(true);
    if (reviewed.ok) {
      expect(reviewed.data).toMatchObject({
        candidate: {
          id: candidateId,
          status: 'accepted',
          review_note: 'Evidence supports this capability.',
          reviewed_at: expect.any(String),
        },
      });
    }
  });

  it('lists candidates in compact mode with status and type filters', async () => {
    const { marketId, documentId } = await createDocumentFixture();
    const payloadFile = writePayload({
      candidates: [
        {
          candidate_type: 'capability',
          name: 'Prompt injection detection',
          summary: 'Detects prompt injection attempts.',
          confidence: 'high',
          evidence: [{ document_id: documentId, quote: 'prompt injection', note: null }],
          metadata: { source: 'agent' },
        },
        {
          candidate_type: 'company',
          name: 'Example Vendor',
          summary: 'Vendor summary.',
          confidence: 'medium',
          evidence: [{ document_id: documentId, quote: 'Vendor', note: null }],
        },
      ],
    });

    const imported = await dispatch(
      {
        id: 'req-candidates-import-filter',
        command: 'market-candidates-import',
        args: { market_id: marketId, 'payload-file': payloadFile },
      },
      { caller: 'host' },
    );
    expect(imported.ok).toBe(true);
    const capabilityId = (
      imported as { ok: true; data: { candidates: Array<{ id: string; candidate_type: string }> } }
    ).data.candidates.find((candidate) => candidate.candidate_type === 'capability')!.id;

    const listed = await dispatch(
      {
        id: 'req-candidates-list-compact',
        command: 'market-candidates-list',
        args: { market_id: marketId, status: 'proposed', type: 'capability', compact: true },
      },
      { caller: 'host' },
    );

    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const data = listed.data as { candidates: Array<Record<string, unknown>> };
      expect(data.candidates).toEqual([
        {
          id: capabilityId,
          candidate_type: 'capability',
          name: 'Prompt injection detection',
          summary: 'Detects prompt injection attempts.',
          confidence: 'high',
          status: 'proposed',
        },
      ]);
      expect(data.candidates[0].evidence_json).toBeUndefined();
      expect(data.candidates[0].evidence).toBeUndefined();
      expect(data.candidates[0].metadata_json).toBeUndefined();
      expect(data.candidates[0].metadata).toBeUndefined();
      expect(data.candidates[0].created_at).toBeUndefined();
      expect(data.candidates[0].updated_at).toBeUndefined();
    }
  });

  it('summarizes candidates by status, type, confidence, and latest extraction run', async () => {
    const { marketId, documentId } = await createDocumentFixture();
    const payloadFile = writePayload({
      candidates: [
        {
          candidate_type: 'capability',
          name: 'Prompt injection detection',
          confidence: 'high',
          evidence: [{ document_id: documentId, quote: 'prompt injection', note: null }],
        },
        {
          candidate_type: 'company',
          name: 'Example Vendor',
          confidence: 'medium',
          evidence: [{ document_id: documentId, quote: 'Vendor', note: null }],
        },
      ],
    });

    const imported = await dispatch(
      {
        id: 'req-candidates-import-summary',
        command: 'market-candidates-import',
        args: { market_id: marketId, 'payload-file': payloadFile },
      },
      { caller: 'host' },
    );
    expect(imported.ok).toBe(true);
    const candidateId = (imported as { ok: true; data: { candidates: Array<{ id: string }> } }).data.candidates[0].id;
    await dispatch(
      {
        id: 'req-candidates-review-summary',
        command: 'market-candidates-review',
        args: { id: candidateId, status: 'accepted', 'review-note': 'Accepted by user review.' },
      },
      { caller: 'host' },
    );

    const summary = await dispatch(
      {
        id: 'req-candidates-summary',
        command: 'market-candidates-summary',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );

    expect(summary.ok).toBe(true);
    if (summary.ok) {
      expect(summary.data).toMatchObject({
        market_id: marketId,
        total: 2,
        by_status: { accepted: 1, proposed: 1 },
        by_type: { capability: 1, company: 1 },
        by_confidence: { high: 1, medium: 1 },
        latest_extraction_run: {
          id: expect.stringMatching(/^mrun_/),
          status: 'completed',
          started_at: expect.any(String),
          completed_at: expect.any(String),
        },
      });
    }
  });

  it('reviews candidates in batches and reports partial failures', async () => {
    const { marketId, documentId } = await createDocumentFixture();
    const payloadFile = writePayload({
      candidates: [
        {
          candidate_type: 'capability',
          name: 'Prompt injection detection',
          confidence: 'high',
          evidence: [{ document_id: documentId, quote: 'prompt injection', note: null }],
        },
        {
          candidate_type: 'claim',
          name: 'Vendor-reported runtime protection',
          confidence: 'medium',
          evidence: [{ document_id: documentId, quote: 'Vendor protects', note: null }],
        },
      ],
    });
    const imported = await dispatch(
      {
        id: 'req-candidates-import-batch',
        command: 'market-candidates-import',
        args: { market_id: marketId, 'payload-file': payloadFile },
      },
      { caller: 'host' },
    );
    expect(imported.ok).toBe(true);
    const ids = (imported as { ok: true; data: { candidates: Array<{ id: string }> } }).data.candidates.map(
      (candidate) => candidate.id,
    );

    const reviewed = await dispatch(
      {
        id: 'req-candidates-review-batch',
        command: 'market-candidates-review-batch',
        args: { ids: `${ids[0]},mcand_missing,${ids[1]}`, status: 'accepted', 'review-note': 'Accepted in batch.' },
      },
      { caller: 'host' },
    );

    expect(reviewed.ok).toBe(true);
    if (reviewed.ok) {
      expect(reviewed.data).toMatchObject({
        reviewed: [
          { id: ids[0], status: 'accepted' },
          { id: ids[1], status: 'accepted' },
        ],
        failed: [{ id: 'mcand_missing', error: expect.stringContaining('not found') }],
        summary: {
          requested: 3,
          reviewed: 2,
          failed: 1,
        },
      });
    }
  });

  it('rejects empty batch review ids', async () => {
    await registerMarketsResource();

    const reviewed = await dispatch(
      {
        id: 'req-candidates-review-batch-empty',
        command: 'market-candidates-review-batch',
        args: { ids: '  ', status: 'accepted', 'review-note': 'Accepted in batch.' },
      },
      { caller: 'host' },
    );

    expect(reviewed.ok).toBe(false);
    if (!reviewed.ok) {
      expect(reviewed.error.code).toBe('invalid-args');
      expect(reviewed.error.message).toMatch(/ids/i);
    }
  });

  it('dedupes candidate import by market, type, and normalized name only when requested', async () => {
    const { marketId, documentId } = await createDocumentFixture();
    const payload = {
      candidates: [
        {
          candidate_type: 'company',
          name: 'Example Vendor',
          confidence: 'medium',
          evidence: [{ document_id: documentId, quote: 'Vendor', note: null }],
        },
      ],
    };

    const first = await dispatch(
      {
        id: 'req-candidates-import-dedupe-first',
        command: 'market-candidates-import',
        args: { market_id: marketId, 'payload-file': writePayload(payload) },
      },
      { caller: 'host' },
    );
    expect(first.ok).toBe(true);

    const duplicateWithoutDedupe = await dispatch(
      {
        id: 'req-candidates-import-dedupe-off',
        command: 'market-candidates-import',
        args: { market_id: marketId, 'payload-file': writePayload(payload) },
      },
      { caller: 'host' },
    );
    expect(duplicateWithoutDedupe.ok).toBe(true);
    if (duplicateWithoutDedupe.ok) {
      expect(duplicateWithoutDedupe.data).toMatchObject({
        summary: { imported: 1, skipped_duplicates: 0 },
      });
    }

    const duplicateWithDedupe = await dispatch(
      {
        id: 'req-candidates-import-dedupe-on',
        command: 'market-candidates-import',
        args: {
          market_id: marketId,
          'payload-file': writePayload({
            candidates: [
              {
                candidate_type: 'company',
                name: '  example   vendor  ',
                confidence: 'medium',
                evidence: [{ document_id: documentId, quote: 'Vendor', note: null }],
              },
            ],
          }),
          dedupe: true,
        },
      },
      { caller: 'host' },
    );

    expect(duplicateWithDedupe.ok).toBe(true);
    if (duplicateWithDedupe.ok) {
      expect(duplicateWithDedupe.data).toMatchObject({
        summary: { imported: 0, skipped_duplicates: 1 },
        skipped_duplicates: [{ candidate_type: 'company', name: 'example vendor' }],
      });
    }
  });

  it('maps accepted candidates into a read-only grouped market overview', async () => {
    const { marketId, documentId } = await createDocumentFixture();
    const payloadFile = writePayload({
      candidates: [
        {
          candidate_type: 'company',
          name: 'Example Vendor',
          summary: 'Builds code security tooling.',
          confidence: 'high',
          evidence: [{ document_id: documentId, quote: 'Vendor protects', note: 'Company positioning' }],
          metadata: { internal: 'omitted from map' },
        },
        {
          candidate_type: 'product',
          name: 'Example Scanner',
          summary: 'Scans repositories for vulnerable code.',
          confidence: 'medium',
          evidence: [{ document_id: documentId, quote: 'protects AI applications', note: null }],
        },
        {
          candidate_type: 'problem',
          name: 'Prompt injection in code agents',
          summary: 'Attackers can manipulate coding agents through malicious prompts.',
          confidence: 'medium',
          evidence: [{ document_id: documentId, quote: 'prompt injection', note: null }],
        },
        {
          candidate_type: 'capability',
          name: 'Prompt injection detection',
          summary: 'Detects prompt injection attempts.',
          confidence: 'high',
          evidence: [{ document_id: documentId, quote: 'prompt injection', note: 'Capability evidence' }],
        },
        {
          candidate_type: 'category',
          name: 'AI code security',
          summary: 'Security tooling for AI-assisted software development.',
          confidence: 'medium',
          evidence: [{ document_id: documentId, quote: 'AI applications', note: null }],
        },
        {
          candidate_type: 'claim',
          name: 'Vendor-reported runtime protection',
          summary: 'Vendor says it protects AI applications at runtime.',
          confidence: 'low',
          evidence: [{ document_id: documentId, quote: 'Vendor protects AI applications', note: 'Vendor claim' }],
        },
        {
          candidate_type: 'claim',
          name: 'Unreviewed claim',
          summary: 'This should stay out of the accepted map.',
          confidence: 'low',
          evidence: [{ document_id: documentId, quote: 'Vendor protects', note: null }],
        },
        {
          candidate_type: 'product',
          name: 'Rejected product',
          summary: 'This should stay out of the accepted map.',
          confidence: 'low',
          evidence: [{ document_id: documentId, quote: 'Vendor protects', note: null }],
        },
      ],
    });

    const imported = await dispatch(
      {
        id: 'req-candidates-import-map',
        command: 'market-candidates-import',
        args: { market_id: marketId, 'payload-file': payloadFile },
      },
      { caller: 'host' },
    );
    expect(imported.ok).toBe(true);
    const candidates = (
      imported as {
        ok: true;
        data: { candidates: Array<{ id: string; candidate_type: string; name: string }> };
      }
    ).data.candidates;
    const acceptedIds = candidates
      .filter((candidate) => !['Unreviewed claim', 'Rejected product'].includes(candidate.name))
      .map((candidate) => candidate.id);
    const rejectedId = candidates.find((candidate) => candidate.name === 'Rejected product')!.id;
    const companyId = candidates.find((candidate) => candidate.candidate_type === 'company')!.id;

    const accepted = await dispatch(
      {
        id: 'req-candidates-review-map-accepted',
        command: 'market-candidates-review-batch',
        args: {
          ids: acceptedIds.join(','),
          status: 'accepted',
          'review-note': 'Accepted by user review for market map.',
        },
      },
      { caller: 'host' },
    );
    expect(accepted.ok).toBe(true);

    const rejected = await dispatch(
      {
        id: 'req-candidates-review-map-rejected',
        command: 'market-candidates-review',
        args: { id: rejectedId, status: 'rejected', 'review-note': 'Out of scope.' },
      },
      { caller: 'host' },
    );
    expect(rejected.ok).toBe(true);

    const mapped = await dispatch(
      {
        id: 'req-candidates-map',
        command: 'market-candidates-map',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );

    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.data).toMatchObject({
        market_id: marketId,
        status: 'accepted',
        summary: {
          total: 6,
          by_type: {
            company: 1,
            product: 1,
            problem: 1,
            capability: 1,
            category: 1,
            claim: 1,
          },
        },
        groups: {
          companies: [
            {
              id: companyId,
              name: 'Example Vendor',
              summary: 'Builds code security tooling.',
              confidence: 'high',
              review_note: 'Accepted by user review for market map.',
              evidence: [{ document_id: documentId, quote: 'Vendor protects', note: 'Company positioning' }],
            },
          ],
          products: [expect.objectContaining({ name: 'Example Scanner' })],
          problems: [expect.objectContaining({ name: 'Prompt injection in code agents' })],
          capabilities: [expect.objectContaining({ name: 'Prompt injection detection' })],
          categories: [expect.objectContaining({ name: 'AI code security' })],
          claims: [expect.objectContaining({ name: 'Vendor-reported runtime protection' })],
        },
        next_actions: expect.arrayContaining([
          expect.stringContaining('market-candidates summary'),
          expect.stringContaining('market-candidates list'),
        ]),
      });

      const data = mapped.data as {
        groups: { companies: Array<Record<string, unknown>>; claims: Array<Record<string, unknown>> };
      };
      expect(data.groups.claims).toHaveLength(1);
      expect(data.groups.claims[0].name).not.toBe('Unreviewed claim');
      expect(data.groups.companies[0].evidence_json).toBeUndefined();
      expect(data.groups.companies[0].metadata_json).toBeUndefined();
      expect(data.groups.companies[0].metadata).toBeUndefined();
      expect(data.groups.companies[0].created_at).toBeUndefined();
      expect(data.groups.companies[0].updated_at).toBeUndefined();
      expect(data.groups.companies[0].reviewed_at).toBeUndefined();
    }
  });

  it('returns an empty accepted candidate map for markets without accepted candidates', async () => {
    const { marketId } = await createDocumentFixture();

    const mapped = await dispatch(
      {
        id: 'req-candidates-map-empty',
        command: 'market-candidates-map',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );

    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.data).toEqual({
        market_id: marketId,
        status: 'accepted',
        groups: {
          companies: [],
          products: [],
          problems: [],
          capabilities: [],
          categories: [],
          claims: [],
        },
        summary: {
          total: 0,
          by_type: {},
        },
        next_actions: expect.arrayContaining([expect.stringContaining('market-candidates list')]),
      });
    }
  });

  it('rejects candidate map requests for unknown markets', async () => {
    await registerMarketsResource();

    const mapped = await dispatch(
      {
        id: 'req-candidates-map-missing-market',
        command: 'market-candidates-map',
        args: { market_id: 'mkt_missing' },
      },
      { caller: 'host' },
    );

    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.error.code).toBe('handler-error');
      expect(mapped.error.message).toMatch(/market not found/i);
    }
  });
});
