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

function longText(seed: string): string {
  return Array.from({ length: 18 }, () => seed).join(' ');
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
        .mockImplementation(() =>
          Promise.resolve(
            new Response(
              '<html><head><title>Vendor homepage</title></head><body>Vendor protects AI applications from prompt injection.</body></html>',
              { status: 200, headers: { 'content-type': 'text/html' } },
            ),
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
        unchanged_documents: [],
        unsupported: [],
        summary: {
          visited: 1,
          stored_documents: 1,
          unchanged_documents: 0,
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

  it('retries OpenAI Help Center article exact_url collection with a compatibility profile after 403', async () => {
    await registerMarketsResource();

    const created = await dispatch(
      {
        id: 'req-create-market',
        command: 'markets-create',
        args: { name: 'Code Security', description: null },
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
          url: 'https://help.openai.com/en/articles/20001107',
          source_type: 'exact_url',
          trust_tier: 'official',
        },
      },
      { caller: 'host' },
    );
    expect(added.ok).toBe(true);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('forbidden', { status: 403, statusText: 'Forbidden' }))
      .mockResolvedValueOnce(
        new Response(
          '<html><head><title>Codex Security</title></head><body>Codex Security helps teams identify and remediate vulnerabilities in code.</body></html>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const fetched = await dispatch(
      {
        id: 'req-sources-fetch-openai-help',
        command: 'market-sources-collect',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );

    expect(fetched.ok).toBe(true);
    if (fetched.ok) {
      expect(fetched.data).toMatchObject({
        stored_documents: [
          {
            url: 'https://help.openai.com/en/articles/20001107',
            status: 'fetched',
          },
        ],
        failed: [],
        summary: {
          visited: 1,
          stored_documents: 1,
          failed: 0,
        },
        documents: [
          {
            url: 'https://help.openai.com/en/articles/20001107',
            title: 'Codex Security',
            status: 'fetched',
            content_text: expect.stringContaining('remediate vulnerabilities'),
          },
        ],
      });
      const data = fetched.data as { documents: Array<{ metadata_json: string }> };
      expect(JSON.parse(data.documents[0].metadata_json)).toMatchObject({
        content_type: 'text/html',
        fetch_profile: 'help_center_browser',
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://help.openai.com/en/articles/20001107', {
      headers: expect.objectContaining({
        'User-Agent': expect.stringContaining('Mozilla/5.0'),
      }),
      redirect: 'follow',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://help.openai.com/en/articles/20001107', {
      headers: expect.objectContaining({
        Referer: 'https://help.openai.com/',
        'Sec-Fetch-Mode': 'navigate',
      }),
      redirect: 'follow',
    });
  });

  it('does not retry generic exact_url collection after 403', async () => {
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
          url: 'https://example.com/blocked',
          source_type: 'exact_url',
          trust_tier: 'trusted',
        },
      },
      { caller: 'host' },
    );

    const fetchMock = vi.fn().mockResolvedValue(new Response('forbidden', { status: 403, statusText: 'Forbidden' }));
    vi.stubGlobal('fetch', fetchMock);

    const fetched = await dispatch(
      {
        id: 'req-sources-fetch-generic-403',
        command: 'market-sources-collect',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );

    expect(fetched.ok).toBe(true);
    if (fetched.ok) {
      expect(fetched.data).toMatchObject({
        stored_documents: [],
        failed: [
          {
            url: 'https://example.com/blocked',
            status: 'failed',
            error: expect.stringContaining('HTTP 403'),
          },
        ],
        summary: {
          visited: 1,
          stored_documents: 0,
          failed: 1,
        },
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports unchanged exact_url collection without storing duplicate market documents', async () => {
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
          notes: null,
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
        .mockImplementation(() =>
          Promise.resolve(
            new Response(
              '<html><head><title>Vendor homepage</title></head><body>Vendor protects AI applications.</body></html>',
              { status: 200, headers: { 'content-type': 'text/html' } },
            ),
          ),
        ),
    );

    const first = await dispatch(
      {
        id: 'req-sources-fetch-first',
        command: 'market-sources-collect',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );
    expect(first.ok).toBe(true);
    const firstDocumentId = (first as { ok: true; data: { stored_documents: Array<{ document_id: string }> } }).data
      .stored_documents[0].document_id;

    const second = await dispatch(
      {
        id: 'req-sources-fetch-second',
        command: 'market-sources-collect',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );

    expect(second.ok).toBe(true);
    if (second.ok) {
      const data = second.data as {
        run: { summary: string | null };
        stored_documents: unknown[];
        failed: unknown[];
        unchanged_documents: unknown[];
        summary: Record<string, unknown>;
        documents: unknown[];
      };
      expect(data).toMatchObject({
        stored_documents: [],
        failed: [],
        unchanged_documents: [
          {
            source_id: sourceId,
            url: 'https://example.com/vendor',
            status: 'unchanged',
            document_id: firstDocumentId,
          },
        ],
        summary: {
          visited: 1,
          stored_documents: 0,
          unchanged_documents: 1,
          skipped: 0,
          failed: 0,
          unsupported: 0,
        },
        documents: [],
      });
      expect(JSON.parse(data.run.summary as string)).toMatchObject({
        visited: 1,
        stored_documents: 0,
        unchanged_documents: 1,
        unchanged: [
          {
            source_id: sourceId,
            document_id: firstDocumentId,
          },
        ],
      });
    }

    const listed = await dispatch(
      {
        id: 'req-documents-list',
        command: 'market-documents-list',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const data = listed.data as { documents: unknown[] };
      expect(data.documents).toHaveLength(1);
    }
  });

  it('stores a new document when exact_url content changes', async () => {
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
      vi
        .fn()
        .mockResolvedValueOnce(new Response('Version one', { status: 200, headers: { 'content-type': 'text/plain' } }))
        .mockResolvedValueOnce(new Response('Version two', { status: 200, headers: { 'content-type': 'text/plain' } })),
    );

    await dispatch(
      {
        id: 'req-sources-fetch-first',
        command: 'market-sources-collect',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );
    const second = await dispatch(
      {
        id: 'req-sources-fetch-second',
        command: 'market-sources-collect',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );

    expect(second.ok).toBe(true);
    if (second.ok) {
      const data = second.data as { summary: Record<string, unknown>; unchanged_documents: unknown[] };
      expect(data.summary).toMatchObject({
        stored_documents: 1,
        unchanged_documents: 0,
      });
      expect(data.unchanged_documents).toEqual([]);
    }

    const listed = await dispatch(
      {
        id: 'req-documents-list',
        command: 'market-documents-list',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      const data = listed.data as { documents: unknown[] };
      expect(data.documents).toHaveLength(2);
    }
  });

  it('stores separate documents for unchanged content from different sources', async () => {
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
        id: 'req-source-add-1',
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
    await dispatch(
      {
        id: 'req-source-add-2',
        command: 'market-sources-add',
        args: {
          market_id: marketId,
          url: 'https://example.com/vendor-copy',
          source_type: 'exact_url',
          trust_tier: 'trusted',
        },
      },
      { caller: 'host' },
    );

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            new Response('Same vendor content', { status: 200, headers: { 'content-type': 'text/plain' } }),
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
      const data = fetched.data as {
        summary: Record<string, unknown>;
        unchanged_documents: unknown[];
        documents: unknown[];
      };
      expect(data.summary).toMatchObject({
        stored_documents: 2,
        unchanged_documents: 0,
      });
      expect(data.unchanged_documents).toEqual([]);
      expect(data.documents).toHaveLength(2);
    }
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
        unchanged_documents: [],
        unsupported: [],
        summary: {
          visited: 1,
          stored_documents: 0,
          unchanged_documents: 0,
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

  it('crawls docs sources into one market document per same-origin HTML page', async () => {
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

    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://docs.example.com/') {
        return new Response(
          `<html><head><title>Vendor Docs</title></head><body>${longText(
            'Vendor documentation explains the platform architecture, deployment model, security controls, integrations, governance workflows, and operational practices for teams evaluating AI application protection.',
          )} <a href="/security/prompt-injection">Prompt Injection</a></body></html>`,
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }
      if (url === 'https://docs.example.com/security/prompt-injection') {
        return new Response(
          `<html><head><title>Prompt Injection Protection</title></head><body>${longText(
            'Prompt injection protection documentation describes detection signals, policy controls, runtime enforcement, model-facing guardrails, alert routing, and review workflows for security teams operating AI applications.',
          )}</body></html>`,
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const collected = await dispatch(
      {
        id: 'req-sources-collect-docs',
        command: 'market-sources-collect',
        args: { market_id: marketId, 'max-pages': 5, 'max-depth': 1 },
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
        stored_documents: [
          {
            source_id: sourceId,
            url: 'https://docs.example.com/',
            status: 'fetched',
            document_id: expect.stringMatching(/^mdoc_/),
          },
          {
            source_id: sourceId,
            url: 'https://docs.example.com/security/prompt-injection',
            status: 'fetched',
            document_id: expect.stringMatching(/^mdoc_/),
          },
        ],
        failed: [],
        unchanged_documents: [],
        unsupported: [],
        summary: {
          visited: 2,
          stored_documents: 2,
          unchanged_documents: 0,
          skipped: 0,
          failed: 0,
          unsupported: 0,
        },
        documents: [
          {
            market_id: marketId,
            source_id: sourceId,
            url: 'https://docs.example.com/',
            canonical_url: 'https://docs.example.com/',
            title: 'Vendor Docs',
            status: 'fetched',
          },
          {
            market_id: marketId,
            source_id: sourceId,
            url: 'https://docs.example.com/security/prompt-injection',
            canonical_url: 'https://docs.example.com/security/prompt-injection',
            title: 'Prompt Injection Protection',
            status: 'fetched',
          },
        ],
      });
      const data = collected.data as { documents: Array<{ metadata_json: string }> };
      expect(JSON.parse(data.documents[0].metadata_json)).toMatchObject({
        source_type: 'docs',
        depth: 0,
      });
      expect(JSON.parse(data.documents[1].metadata_json)).toMatchObject({
        source_type: 'docs',
        depth: 1,
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bounds website crawling and reports skipped URLs without leaving same origin', async () => {
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
          url: 'https://vendor.example.com',
          source_type: 'website',
          trust_tier: 'official',
        },
      },
      { caller: 'host' },
    );

    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://vendor.example.com/') {
        return new Response(
          [
            '<html><head><title>Vendor</title></head><body>',
            longText(
              'Vendor homepage describes an AI security platform with product capabilities, deployment options, governance workflows, integrations, customer evidence, and security operations use cases for enterprise teams.',
            ),
            '<a href="/platform">Platform</a>',
            '<a href="/platform#overview">Platform duplicate</a>',
            '<a href="https://other.example.com/offsite">External</a>',
            '<a href="/whitepaper.pdf">PDF</a>',
            '<a href="/zzz-deep">Deep</a>',
            '</body></html>',
          ].join(''),
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }
      if (url === 'https://vendor.example.com/platform') {
        return new Response(
          `<html><head><title>Vendor Platform</title></head><body>${longText(
            'The platform page details model monitoring, prompt injection protection, data leakage controls, policy management, integrations, deployment architecture, and evidence collection for AI security programs.',
          )}</body></html>`,
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }
      if (url === 'https://vendor.example.com/whitepaper.pdf') {
        return new Response('pdf bytes', { status: 200, headers: { 'content-type': 'application/pdf' } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const collected = await dispatch(
      {
        id: 'req-sources-collect-website',
        command: 'market-sources-collect',
        args: { market_id: marketId, 'max-pages': 3, 'max-depth': 1 },
      },
      { caller: 'host' },
    );

    expect(collected.ok).toBe(true);
    if (collected.ok) {
      const data = collected.data as {
        summary: { skipped: number };
        stored_documents: Array<{ url: string }>;
        skipped_urls: Array<{ url: string; reason: string }>;
      };
      expect(data.stored_documents.map((item) => item.url)).toEqual([
        'https://vendor.example.com/',
        'https://vendor.example.com/platform',
      ]);
      expect(data.summary).toMatchObject({
        visited: 3,
        stored_documents: 2,
        unchanged_documents: 0,
        skipped: 4,
        failed: 0,
        unsupported: 0,
      });
      expect(data.skipped_urls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ url: 'https://vendor.example.com/platform', reason: 'duplicate' }),
          expect.objectContaining({ url: 'https://other.example.com/offsite', reason: 'out_of_scope' }),
          expect.objectContaining({
            url: 'https://vendor.example.com/whitepaper.pdf',
            reason: 'unsupported_content_type',
          }),
          expect.objectContaining({ url: 'https://vendor.example.com/zzz-deep', reason: 'max_pages' }),
        ]),
      );
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('skips low-value website paths before fetching or storing them', async () => {
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
          url: 'https://vendor.example.com',
          source_type: 'website',
          trust_tier: 'official',
        },
      },
      { caller: 'host' },
    );

    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://vendor.example.com/') {
        return new Response(
          `<html><head><title>Vendor</title></head><body>${longText(
            'Vendor page describes AI security product capabilities, architecture, integrations, governance, runtime controls, evaluation workflows, evidence collection, deployment models, and operational outcomes.',
          )} <a href="/careers">Careers</a><a href="/privacy">Privacy</a><a href="/book-a-demo/">Book a demo</a><a href="/contact-us/">Contact us</a><a href="/pricing">Pricing</a></body></html>`,
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }
      if (url === 'https://vendor.example.com/pricing') {
        return new Response(
          `<html><head><title>Pricing</title></head><body>${longText(
            'Pricing page explains product editions, platform packaging, security capabilities, support tiers, deployment considerations, usage dimensions, enterprise controls, and procurement details.',
          )}</body></html>`,
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const collected = await dispatch(
      {
        id: 'req-sources-collect-low-value-paths',
        command: 'market-sources-collect',
        args: { market_id: marketId, 'max-pages': 5, 'max-depth': 1 },
      },
      { caller: 'host' },
    );

    expect(collected.ok).toBe(true);
    if (collected.ok) {
      const data = collected.data as {
        stored_documents: Array<{ url: string }>;
        skipped_urls: Array<{ url: string; reason: string }>;
        summary: Record<string, unknown>;
      };
      expect(data.stored_documents.map((item) => item.url)).toEqual([
        'https://vendor.example.com/',
        'https://vendor.example.com/pricing',
      ]);
      expect(data.skipped_urls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ url: 'https://vendor.example.com/careers', reason: 'excluded_low_value_path' }),
          expect.objectContaining({ url: 'https://vendor.example.com/privacy', reason: 'excluded_low_value_path' }),
          expect.objectContaining({
            url: 'https://vendor.example.com/book-a-demo',
            reason: 'excluded_low_value_path',
          }),
          expect.objectContaining({
            url: 'https://vendor.example.com/contact-us',
            reason: 'excluded_low_value_path',
          }),
        ]),
      );
      expect(data.summary).toMatchObject({
        visited: 2,
        stored_documents: 2,
        skipped: 4,
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalledWith('https://vendor.example.com/careers', expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith('https://vendor.example.com/privacy', expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith('https://vendor.example.com/book-a-demo', expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith('https://vendor.example.com/contact-us', expect.anything());
  });

  it('normalizes trailing-slash URL variants before crawling and storing documents', async () => {
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
          url: 'https://vendor.example.com',
          source_type: 'website',
          trust_tier: 'official',
        },
      },
      { caller: 'host' },
    );

    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://vendor.example.com/') {
        return new Response(
          `<html><head><title>Vendor</title></head><body>${longText(
            'Vendor homepage describes AI security modules, product architecture, deployment models, integrations, governance workflows, evidence collection, and operational outcomes.',
          )} <a href="/aispm/">AISPM slash</a><a href="/aispm">AISPM no slash</a></body></html>`,
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }
      if (url === 'https://vendor.example.com/aispm') {
        return new Response(
          `<html><head><title>AISPM</title></head><body>${longText(
            'AISPM product page explains AI security posture management, inventory, risk scoring, policy enforcement, integrations, governance workflows, evidence collection, and operational reporting.',
          )}</body></html>`,
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const collected = await dispatch(
      {
        id: 'req-sources-collect-trailing-slash-dedupe',
        command: 'market-sources-collect',
        args: { market_id: marketId, 'max-pages': 5, 'max-depth': 1 },
      },
      { caller: 'host' },
    );

    expect(collected.ok).toBe(true);
    if (collected.ok) {
      const data = collected.data as {
        stored_documents: Array<{ url: string }>;
        skipped_urls: Array<{ url: string; reason: string }>;
        summary: Record<string, unknown>;
      };
      expect(data.stored_documents.map((item) => item.url)).toEqual([
        'https://vendor.example.com/',
        'https://vendor.example.com/aispm',
      ]);
      expect(data.skipped_urls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ url: 'https://vendor.example.com/aispm', reason: 'duplicate' }),
        ]),
      );
      expect(data.summary).toMatchObject({
        visited: 2,
        stored_documents: 2,
        skipped: 1,
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://vendor.example.com/aispm', expect.any(Object));
  });

  it('crawls high-value links before neutral links when max-pages is restrictive', async () => {
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
          url: 'https://vendor.example.com',
          source_type: 'website',
          trust_tier: 'official',
        },
      },
      { caller: 'host' },
    );

    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://vendor.example.com/') {
        return new Response(
          `<html><head><title>Vendor</title></head><body>${longText(
            'Vendor page describes AI security product capabilities, platform architecture, integrations, governance, runtime controls, evidence collection, deployment models, and operational outcomes.',
          )} <a href="/about">About</a><a href="/security">Security</a></body></html>`,
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }
      if (url === 'https://vendor.example.com/security') {
        return new Response(
          `<html><head><title>Security</title></head><body>${longText(
            'Security page describes prompt injection defenses, data leakage controls, model monitoring, access controls, audit trails, integrations, incident response, and governance features.',
          )}</body></html>`,
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const collected = await dispatch(
      {
        id: 'req-sources-collect-prioritized-links',
        command: 'market-sources-collect',
        args: { market_id: marketId, 'max-pages': 2, 'max-depth': 1 },
      },
      { caller: 'host' },
    );

    expect(collected.ok).toBe(true);
    if (collected.ok) {
      const data = collected.data as {
        stored_documents: Array<{ url: string }>;
        skipped_urls: Array<{ url: string; reason: string }>;
      };
      expect(data.stored_documents.map((item) => item.url)).toEqual([
        'https://vendor.example.com/',
        'https://vendor.example.com/security',
      ]);
      expect(data.skipped_urls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ url: 'https://vendor.example.com/about', reason: 'max_pages' }),
        ]),
      );
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://vendor.example.com/security', expect.any(Object));
  });

  it('skips low-quality crawled HTML pages after fetching without storing documents', async () => {
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
          url: 'https://docs.example.com',
          source_type: 'docs',
          trust_tier: 'official',
        },
      },
      { caller: 'host' },
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<html><head><title>Thin Docs</title></head><body>Short placeholder.</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    );

    const collected = await dispatch(
      {
        id: 'req-sources-collect-low-quality',
        command: 'market-sources-collect',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );

    expect(collected.ok).toBe(true);
    if (collected.ok) {
      expect(collected.data).toMatchObject({
        stored_documents: [],
        documents: [],
        skipped_urls: [
          {
            url: 'https://docs.example.com/',
            reason: 'low_quality_content',
          },
        ],
        summary: {
          visited: 1,
          stored_documents: 0,
          skipped: 1,
          failed: 0,
        },
      });
    }
  });

  it('records failed crawled pages without aborting the source crawl', async () => {
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
          url: 'https://docs.example.com',
          source_type: 'docs',
          trust_tier: 'official',
        },
      },
      { caller: 'host' },
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === 'https://docs.example.com/') {
          return new Response(
            `<html><head><title>Docs</title></head><body>${longText(
              'Documentation root provides implementation guidance, architecture notes, connector setup, threat model details, supported environments, and operational procedures for AI security evaluation.',
            )} <a href="/broken">Broken</a></body></html>`,
            { status: 200, headers: { 'content-type': 'text/html' } },
          );
        }
        return new Response('server error', { status: 500, statusText: 'Server Error' });
      }),
    );

    const collected = await dispatch(
      {
        id: 'req-sources-collect-docs-failed-child',
        command: 'market-sources-collect',
        args: { market_id: marketId, 'max-pages': 5, 'max-depth': 1 },
      },
      { caller: 'host' },
    );

    expect(collected.ok).toBe(true);
    if (collected.ok) {
      expect(collected.data).toMatchObject({
        summary: {
          visited: 2,
          stored_documents: 1,
          failed: 1,
        },
        stored_documents: [{ url: 'https://docs.example.com/' }],
        failed: [
          {
            url: 'https://docs.example.com/broken',
            status: 'failed',
            error: expect.stringContaining('HTTP 500'),
          },
        ],
      });
    }
  });

  it('reports unchanged crawled pages without storing duplicate market documents', async () => {
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
          url: 'https://docs.example.com',
          source_type: 'docs',
          trust_tier: 'official',
        },
      },
      { caller: 'host' },
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            `<html><head><title>Docs</title></head><body>${longText(
              'Stable documentation explains the product architecture, security model, deployment flow, integrations, data handling, evidence collection, and operational controls for AI application security teams.',
            )}</body></html>`,
            {
              status: 200,
              headers: { 'content-type': 'text/html' },
            },
          ),
      ),
    );

    const first = await dispatch(
      {
        id: 'req-sources-collect-docs-first',
        command: 'market-sources-collect',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );
    expect(first.ok).toBe(true);
    const firstDocumentId = (first as { ok: true; data: { stored_documents: Array<{ document_id: string }> } }).data
      .stored_documents[0].document_id;

    const second = await dispatch(
      {
        id: 'req-sources-collect-docs-second',
        command: 'market-sources-collect',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.data).toMatchObject({
        stored_documents: [],
        unchanged_documents: [
          {
            url: 'https://docs.example.com/',
            status: 'unchanged',
            document_id: firstDocumentId,
          },
        ],
        summary: {
          visited: 1,
          stored_documents: 0,
          unchanged_documents: 1,
          skipped: 0,
          failed: 0,
          unsupported: 0,
        },
        documents: [],
      });
    }
  });

  it('reports still-unsupported research surfaces instead of treating them as exact URL fetches', async () => {
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
          url: 'https://vendor.example.com/feed.xml',
          source_type: 'rss',
          trust_tier: 'official',
          notes: 'Vendor feed',
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
        stored_documents: [],
        failed: [],
        unchanged_documents: [],
        unsupported: [
          {
            source_id: sourceId,
            source_type: 'rss',
            url: 'https://vendor.example.com/feed.xml',
            reason: expect.stringContaining('unsupported'),
          },
        ],
        summary: {
          visited: 0,
          stored_documents: 0,
          unchanged_documents: 0,
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
          unchanged_documents: 0,
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

describe('market source proposal CLI resource', () => {
  async function createMarketForSourceProposals(): Promise<string> {
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
    return (created as { ok: true; data: { market: { id: string } } }).data.market.id;
  }

  it('imports and lists agent-discovered source proposals for review', async () => {
    const marketId = await createMarketForSourceProposals();
    const payloadFile = writePayload({
      proposals: [
        {
          url: 'https://vendor.example.com/',
          source_type: 'website',
          trust_tier: 'official',
          title: 'Vendor Example',
          snippet: 'AI security platform for enterprise teams.',
          rationale: 'Official company website found while searching AI security companies.',
          discovered_from: 'agent_web_search',
          search_query: 'AI security companies',
          proposed_entity_name: 'Vendor Example',
          proposed_entity_type: 'company',
          metadata: { rank: 1 },
        },
      ],
    });

    const imported = await dispatch(
      {
        id: 'req-source-proposals-import',
        command: 'market-source-proposals-import',
        args: { market_id: marketId, payload_file: payloadFile },
      },
      { caller: 'host' },
    );

    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.data).toMatchObject({
        summary: { imported: 1, skipped_duplicates: 0 },
        proposals: [
          {
            market_id: marketId,
            url: 'https://vendor.example.com/',
            source_type: 'website',
            trust_tier: 'official',
            title: 'Vendor Example',
            status: 'proposed',
            source_id: null,
          },
        ],
        next_actions: expect.arrayContaining([expect.stringContaining('market-source-proposals list')]),
      });
      const proposal = (imported.data as { proposals: Array<{ id: string; metadata: unknown }> }).proposals[0];
      expect(proposal.id).toMatch(/^msprop_/);
      expect(proposal.metadata).toEqual({ rank: 1 });
    }

    const listed = await dispatch(
      {
        id: 'req-source-proposals-list',
        command: 'market-source-proposals-list',
        args: { market_id: marketId, status: 'proposed' },
      },
      { caller: 'host' },
    );

    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.data).toMatchObject({
        proposals: [
          {
            url: 'https://vendor.example.com/',
            status: 'proposed',
            rationale: 'Official company website found while searching AI security companies.',
          },
        ],
      });
    }
  });

  it('rejects invalid source proposal payloads with actionable errors', async () => {
    const marketId = await createMarketForSourceProposals();

    const invalidPayloads = [
      {
        payload: { proposals: [{ source_type: 'website', rationale: 'Missing URL.' }] },
        error: /url/i,
      },
      {
        payload: { proposals: [{ url: 'not a url', source_type: 'website', rationale: 'Invalid URL.' }] },
        error: /valid URL/i,
      },
      {
        payload: { proposals: [{ url: 'https://vendor.example.com', source_type: 'url', rationale: 'Generic URL.' }] },
        error: /source_type/i,
      },
      {
        payload: { proposals: [{ url: 'https://vendor.example.com', source_type: 'website' }] },
        error: /rationale/i,
      },
    ];

    for (const item of invalidPayloads) {
      const resp = await dispatch(
        {
          id: 'req-source-proposals-invalid',
          command: 'market-source-proposals-import',
          args: { market_id: marketId, payload_file: writePayload(item.payload) },
        },
        { caller: 'host' },
      );

      expect(resp.ok).toBe(false);
      if (!resp.ok) expect(resp.error.message).toMatch(item.error);
    }
  });

  it('deduplicates repeated proposal imports and existing market sources', async () => {
    const marketId = await createMarketForSourceProposals();

    await dispatch(
      {
        id: 'req-source-add-existing',
        command: 'market-sources-add',
        args: {
          market_id: marketId,
          url: 'https://existing.example.com/',
          source_type: 'website',
          trust_tier: 'official',
        },
      },
      { caller: 'host' },
    );

    const payloadFile = writePayload({
      proposals: [
        {
          url: 'https://vendor.example.com/',
          source_type: 'website',
          trust_tier: 'official',
          rationale: 'Official website discovered by search.',
        },
        {
          url: 'https://vendor.example.com',
          source_type: 'website',
          trust_tier: 'official',
          rationale: 'Duplicate search result variant.',
        },
        {
          url: 'https://existing.example.com',
          source_type: 'website',
          trust_tier: 'official',
          rationale: 'Already configured source.',
        },
      ],
    });

    const imported = await dispatch(
      {
        id: 'req-source-proposals-dedupe',
        command: 'market-source-proposals-import',
        args: { market_id: marketId, payload_file: payloadFile },
      },
      { caller: 'host' },
    );

    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.data).toMatchObject({
        summary: { imported: 1, skipped_duplicates: 2 },
        skipped_duplicates: [
          expect.objectContaining({ url: 'https://vendor.example.com/', duplicate_type: 'proposal' }),
          expect.objectContaining({ url: 'https://existing.example.com/', duplicate_type: 'source' }),
        ],
      });
    }
  });

  it('accepts proposals into ordinary market sources and links existing sources without duplicating them', async () => {
    const marketId = await createMarketForSourceProposals();
    const payloadFile = writePayload({
      proposals: [
        {
          url: 'https://vendor.example.com',
          source_type: 'website',
          trust_tier: 'official',
          title: 'Vendor Example',
          rationale: 'Official website discovered by search.',
        },
        {
          url: 'https://docs.example.com',
          source_type: 'docs',
          trust_tier: 'official',
          title: 'Vendor Docs',
          rationale: 'Official documentation discovered by search.',
        },
      ],
    });

    const imported = await dispatch(
      {
        id: 'req-source-proposals-import-accept',
        command: 'market-source-proposals-import',
        args: { market_id: marketId, payload_file: payloadFile },
      },
      { caller: 'host' },
    );
    expect(imported.ok).toBe(true);
    const [websiteProposal, docsProposal] = (imported as { ok: true; data: { proposals: Array<{ id: string }> } }).data
      .proposals;

    const accepted = await dispatch(
      {
        id: 'req-source-proposals-review-accept',
        command: 'market-source-proposals-review',
        args: {
          id: websiteProposal.id,
          status: 'accepted',
          review_note: 'Official source accepted for crawl.',
        },
      },
      { caller: 'host' },
    );

    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.data).toMatchObject({
        proposal: {
          id: websiteProposal.id,
          status: 'accepted',
          source_id: expect.stringMatching(/^msrc_/),
          review_note: 'Official source accepted for crawl.',
        },
        source: {
          url: 'https://vendor.example.com',
          source_type: 'website',
          trust_tier: 'official',
          status: 'active',
          notes: expect.stringContaining(websiteProposal.id),
        },
      });
    }

    await dispatch(
      {
        id: 'req-source-add-existing-docs',
        command: 'market-sources-add',
        args: {
          market_id: marketId,
          url: 'https://docs.example.com',
          source_type: 'docs',
          trust_tier: 'official',
        },
      },
      { caller: 'host' },
    );

    const linkedExisting = await dispatch(
      {
        id: 'req-source-proposals-review-existing',
        command: 'market-source-proposals-review',
        args: {
          id: docsProposal.id,
          status: 'accepted',
          review_note: 'Existing source accepted from proposal.',
        },
      },
      { caller: 'host' },
    );

    expect(linkedExisting.ok).toBe(true);

    const sources = await dispatch(
      { id: 'req-source-list-after-accept', command: 'market-sources-list', args: { market_id: marketId } },
      { caller: 'host' },
    );
    expect(sources.ok).toBe(true);
    if (sources.ok) {
      expect((sources.data as { sources: unknown[] }).sources).toHaveLength(2);
    }
  });

  it('rejects proposals without creating market sources and supports batch review failures', async () => {
    const marketId = await createMarketForSourceProposals();
    const imported = await dispatch(
      {
        id: 'req-source-proposals-import-reject',
        command: 'market-source-proposals-import',
        args: {
          market_id: marketId,
          payload_file: writePayload({
            proposals: [
              {
                url: 'https://vendor.example.com',
                source_type: 'website',
                rationale: 'Ambiguous search result.',
              },
              {
                url: 'https://docs.example.com',
                source_type: 'docs',
                rationale: 'Official docs search result.',
              },
            ],
          }),
        },
      },
      { caller: 'host' },
    );
    expect(imported.ok).toBe(true);
    const [rejectedProposal, acceptedProposal] = (imported as { ok: true; data: { proposals: Array<{ id: string }> } })
      .data.proposals;

    const rejected = await dispatch(
      {
        id: 'req-source-proposals-review-reject',
        command: 'market-source-proposals-review',
        args: {
          id: rejectedProposal.id,
          status: 'rejected',
          review_note: 'Not enough evidence this is in scope.',
        },
      },
      { caller: 'host' },
    );
    expect(rejected.ok).toBe(true);
    if (rejected.ok) {
      expect(rejected.data).toMatchObject({
        proposal: {
          id: rejectedProposal.id,
          status: 'rejected',
          source_id: null,
          review_note: 'Not enough evidence this is in scope.',
        },
        source: null,
      });
    }

    const batch = await dispatch(
      {
        id: 'req-source-proposals-review-batch',
        command: 'market-source-proposals-review-batch',
        args: {
          ids: `${acceptedProposal.id},msprop_missing`,
          status: 'accepted',
          review_note: 'Accepted clear official source.',
        },
      },
      { caller: 'host' },
    );
    expect(batch.ok).toBe(true);
    if (batch.ok) {
      expect(batch.data).toMatchObject({
        reviewed: [{ id: acceptedProposal.id, status: 'accepted' }],
        failed: [{ id: 'msprop_missing', error: expect.stringContaining('not found') }],
        summary: { requested: 2, reviewed: 1, failed: 1 },
      });
    }

    const sources = await dispatch(
      { id: 'req-source-list-after-reject', command: 'market-sources-list', args: { market_id: marketId } },
      { caller: 'host' },
    );
    expect(sources.ok).toBe(true);
    if (sources.ok) {
      expect((sources.data as { sources: Array<{ url: string }> }).sources.map((source) => source.url)).toEqual([
        'https://docs.example.com',
      ]);
    }
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

  it('searches stored fetched documents with compact evidence excerpts', async () => {
    await registerMarketsResource();

    const created = await dispatch(
      {
        id: 'req-create-market-for-document-search',
        command: 'markets-create',
        args: { name: 'AI Security', description: null },
      },
      { caller: 'host' },
    );
    expect(created.ok).toBe(true);
    const marketId = (created as { ok: true; data: { market: { id: string } } }).data.market.id;

    await dispatch(
      {
        id: 'req-source-add-search-1',
        command: 'market-sources-add',
        args: {
          market_id: marketId,
          url: 'https://example.com/prompt-injection',
          source_type: 'exact_url',
          trust_tier: 'official',
        },
      },
      { caller: 'host' },
    );
    await dispatch(
      {
        id: 'req-source-add-search-2',
        command: 'market-sources-add',
        args: {
          market_id: marketId,
          url: 'https://example.com/data-security',
          source_type: 'exact_url',
          trust_tier: 'official',
        },
      },
      { caller: 'host' },
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === 'https://example.com/prompt-injection') {
          return new Response(
            '<html><head><title>Prompt Injection Protection</title></head><body>The product detects prompt injection attempts in AI applications and routes evidence to security review workflows.</body></html>',
            { status: 200, headers: { 'content-type': 'text/html' } },
          );
        }
        return new Response(
          '<html><head><title>Data Security</title></head><body>The product monitors sensitive data exposure and policy enforcement for AI workloads.</body></html>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }),
    );

    await dispatch(
      {
        id: 'req-collect-for-document-search',
        command: 'market-sources-collect',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );

    const searched = await dispatch(
      {
        id: 'req-documents-search',
        command: 'market-documents-search',
        args: { market_id: marketId, query: 'PROMPT injection' },
      },
      { caller: 'host' },
    );

    expect(searched.ok).toBe(true);
    if (searched.ok) {
      const data = searched.data as { matches: Array<Record<string, unknown>>; summary: Record<string, unknown> };
      expect(data.summary).toMatchObject({
        total_documents: 2,
        searched_documents: 2,
        matches: 1,
        query: 'PROMPT injection',
      });
      expect(data.matches).toHaveLength(1);
      expect(data.matches[0]).toMatchObject({
        id: expect.stringMatching(/^mdoc_/),
        market_id: marketId,
        title: 'Prompt Injection Protection',
        match_type: 'phrase',
        status: 'fetched',
        url: 'https://example.com/prompt-injection',
        excerpts: [expect.stringContaining('prompt injection')],
      });
      expect(data.matches[0].content_text).toBeUndefined();
      expect(data.matches[0].metadata_json).toBeUndefined();
    }
  });

  it('matches normalized query tokens when product wording uses variants', async () => {
    await registerMarketsResource();

    const created = await dispatch(
      {
        id: 'req-create-market-for-token-search',
        command: 'markets-create',
        args: { name: 'AI Security', description: null },
      },
      { caller: 'host' },
    );
    expect(created.ok).toBe(true);
    const marketId = (created as { ok: true; data: { market: { id: string } } }).data.market.id;

    await dispatch(
      {
        id: 'req-source-add-token-search',
        command: 'market-sources-add',
        args: {
          market_id: marketId,
          url: 'https://example.com/runtime',
          source_type: 'exact_url',
          trust_tier: 'official',
        },
      },
      { caller: 'host' },
    );

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            '<html><head><title>Runtime Visibility</title></head><body>The platform runtime monitors agent behavior, detects unsafe tool calls, and blocks prompt injection attempts.</body></html>',
            { status: 200, headers: { 'content-type': 'text/html' } },
          ),
        ),
    );

    await dispatch(
      {
        id: 'req-collect-for-token-search',
        command: 'market-sources-collect',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );

    const searched = await dispatch(
      {
        id: 'req-documents-token-search',
        command: 'market-documents-search',
        args: { market_id: marketId, query: 'runtime monitoring' },
      },
      { caller: 'host' },
    );

    expect(searched.ok).toBe(true);
    if (searched.ok) {
      const data = searched.data as { matches: Array<Record<string, unknown>>; summary: Record<string, unknown> };
      expect(data.summary).toMatchObject({
        matches: 1,
        returned: 1,
        query: 'runtime monitoring',
      });
      expect(data.matches[0]).toMatchObject({
        title: 'Runtime Visibility',
        match_type: 'tokens',
        matched_terms: ['runtime', 'monitor'],
        excerpts: [expect.stringContaining('runtime monitors')],
      });
      expect(data.matches[0].content_text).toBeUndefined();
    }
  });

  it('requires a query when searching stored documents', async () => {
    await registerMarketsResource();

    const resp = await dispatch(
      { id: 'req-documents-search-invalid', command: 'market-documents-search', args: { market_id: 'mkt_missing' } },
      { caller: 'host' },
    );

    expect(resp.ok).toBe(false);
    if (!resp.ok) {
      expect(resp.error.code).toBe('invalid-args');
      expect(resp.error.message).toMatch(/query/i);
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

  it('validates candidate payloads without importing candidates', async () => {
    const { marketId, documentId } = await createDocumentFixture();

    const existingImport = await dispatch(
      {
        id: 'req-candidates-import-existing-for-validate',
        command: 'market-candidates-import',
        args: {
          market_id: marketId,
          'payload-file': writePayload({
            candidates: [
              {
                candidate_type: 'company',
                name: 'Example Vendor',
                confidence: 'medium',
                evidence: [{ document_id: documentId, quote: 'Vendor', note: null }],
              },
            ],
          }),
        },
      },
      { caller: 'host' },
    );
    expect(existingImport.ok).toBe(true);

    const validate = await dispatch(
      {
        id: 'req-candidates-validate',
        command: 'market-candidates-validate',
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
              {
                candidate_type: 'capability',
                name: 'Prompt injection detection',
                summary: 'Detects prompt injection attempts.',
                confidence: 'high',
                evidence: [{ document_id: documentId, quote: 'prompt injection', note: null }],
              },
            ],
          }),
          dedupe: true,
        },
      },
      { caller: 'host' },
    );

    expect(validate.ok).toBe(true);
    if (validate.ok) {
      expect(validate.data).toMatchObject({
        valid: true,
        summary: {
          total: 2,
          importable: 1,
          duplicate_count: 1,
          error_count: 0,
          by_type: { company: 1, capability: 1 },
          by_confidence: { medium: 1, high: 1 },
        },
        importable_candidates: [
          {
            candidate_type: 'capability',
            name: 'Prompt injection detection',
            evidence_count: 1,
          },
        ],
        duplicate_candidates: [
          {
            candidate_type: 'company',
            name: 'example vendor',
            existing_id: expect.stringMatching(/^mcand_/),
          },
        ],
        errors: [],
        next_actions: expect.arrayContaining([expect.stringContaining('market-candidates import')]),
      });
    }

    const listed = await dispatch(
      { id: 'req-candidates-list-after-validate', command: 'market-candidates-list', args: { market_id: marketId } },
      { caller: 'host' },
    );
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect((listed.data as { candidates: unknown[] }).candidates).toHaveLength(1);
    }
  });

  it('reports candidate validation errors without creating an extraction run', async () => {
    const { marketId, documentId } = await createDocumentFixture();
    const other = await createDocumentFixture();

    const validate = await dispatch(
      {
        id: 'req-candidates-validate-invalid',
        command: 'market-candidates-validate',
        args: {
          market_id: marketId,
          'payload-file': writePayload({
            candidates: [
              {
                candidate_type: 'company',
                name: 'Unsupported Vendor',
                confidence: 'low',
                evidence: [],
              },
              {
                candidate_type: 'capability',
                name: 'Cross-market evidence',
                confidence: 'medium',
                evidence: [{ document_id: other.documentId, quote: 'Other market evidence', note: null }],
              },
              {
                candidate_type: 'claim',
                name: 'Supported claim',
                confidence: 'medium',
                evidence: [{ document_id: documentId, quote: 'Vendor', note: null }],
              },
            ],
          }),
        },
      },
      { caller: 'host' },
    );

    expect(validate.ok).toBe(true);
    if (validate.ok) {
      expect(validate.data).toMatchObject({
        valid: false,
        summary: {
          total: 3,
          importable: 1,
          duplicate_count: 0,
          error_count: 2,
        },
        errors: [
          { index: 0, name: 'Unsupported Vendor', message: expect.stringMatching(/evidence/i) },
          { index: 1, name: 'Cross-market evidence', message: expect.stringMatching(/different market/i) },
        ],
      });
    }

    const summary = await dispatch(
      {
        id: 'req-candidates-summary-after-validate',
        command: 'market-candidates-summary',
        args: { market_id: marketId },
      },
      { caller: 'host' },
    );
    expect(summary.ok).toBe(true);
    if (summary.ok) {
      expect(summary.data).toMatchObject({ total: 0, latest_extraction_run: null });
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
