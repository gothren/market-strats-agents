import {
  addMarketSource,
  completeMarketRun,
  createMarketDocument,
  createMarket,
  createMarketRun,
  getLatestMarketRun,
  getMarket,
  getMarketBoundary,
  getMarketDocument,
  listMarketDocuments,
  listMarketSources,
  listMarkets,
  upsertMarketBoundary,
  type MarketDocument,
  type MarketRun,
  type MarketSource,
  type MarketSourceTrustTier,
  type MarketSourceType,
} from '../../db/markets.js';
import { register } from '../registry.js';
import { createHash } from 'node:crypto';

const SOURCE_TYPES = ['website', 'docs', 'blog', 'rss', 'search_query', 'slack', 'exact_url', 'manual'] as const;
const TRUST_TIERS = ['official', 'trusted', 'third_party', 'search', 'private'] as const;

function str(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    const flag = name.replace(/_/g, '-');
    throw new Error(`--${flag} (${name}) is required`);
  }
  return value.trim();
}

function nullableStr(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return String(value);
}

function optionalEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
  name: string,
): T[number] {
  const candidate = value === undefined || value === null || value === '' ? fallback : String(value);
  if (!allowed.includes(candidate)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return candidate;
}

function requiredEnum<T extends readonly string[]>(value: unknown, allowed: T, name: string): T[number] {
  const candidate = str(value, name);
  if (!allowed.includes(candidate)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return candidate;
}

function marketNextActions(marketId: string): string[] {
  return [
    `ncl market-boundaries update --market-id ${marketId} --inclusions "..." --exclusions "..."`,
    `ncl market-sources add --market-id ${marketId} --url https://example.com --source-type exact_url --trust-tier official`,
    `ncl markets get ${marketId}`,
  ];
}

function marketOverview(marketId: string) {
  const market = getMarket(marketId);
  if (!market) throw new Error(`market not found: ${marketId}`);

  return {
    market,
    boundary: getMarketBoundary(marketId) ?? null,
    sources: listMarketSources(marketId),
    latest_run: getLatestMarketRun(marketId) ?? null,
    next_actions: marketNextActions(marketId),
  };
}

register({
  name: 'markets-create',
  description: 'Create a market research workspace.',
  resource: 'markets',
  access: 'open',
  parseArgs: (raw) => ({
    name: str(raw.name, 'name'),
    description: nullableStr(raw.description),
  }),
  handler: async (args) => {
    const market = createMarket(args);
    return {
      market,
      next_actions: marketNextActions(market.id),
    };
  },
});

register({
  name: 'markets-list',
  description: 'List market research workspaces.',
  resource: 'markets',
  access: 'open',
  parseArgs: () => ({}),
  handler: async () => ({ markets: listMarkets() }),
});

register({
  name: 'markets-get',
  description: 'Get a market overview with boundary, sources, and latest run.',
  resource: 'markets',
  access: 'open',
  parseArgs: (raw) => ({ id: str(raw.id, 'id') }),
  handler: async (args) => marketOverview(args.id),
});

register({
  name: 'market-boundaries-update',
  description: 'Create or update the working boundary for a market.',
  resource: 'market-boundaries',
  access: 'open',
  parseArgs: (raw) => ({
    market_id: str(raw.market_id ?? raw['market-id'], 'market_id'),
    inclusions: nullableStr(raw.inclusions),
    exclusions: nullableStr(raw.exclusions),
    adjacent_markets: nullableStr(raw.adjacent_markets ?? raw['adjacent-markets']),
    notes: nullableStr(raw.notes),
  }),
  handler: async (args) => ({
    boundary: upsertMarketBoundary(args),
    next_actions: [
      `ncl market-sources add --market-id ${args.market_id} --url https://example.com --source-type exact_url --trust-tier official`,
      `ncl markets get ${args.market_id}`,
    ],
  }),
});

register({
  name: 'market-sources-add',
  description: 'Add a source URL or connector pointer for a market.',
  resource: 'market-sources',
  access: 'open',
  parseArgs: (raw) => ({
    market_id: str(raw.market_id ?? raw['market-id'], 'market_id'),
    url: str(raw.url, 'url'),
    source_type: requiredEnum(raw.source_type ?? raw['source-type'], SOURCE_TYPES, 'source_type') as MarketSourceType,
    trust_tier: optionalEnum(
      raw.trust_tier ?? raw['trust-tier'],
      TRUST_TIERS,
      'third_party',
      'trust_tier',
    ) as MarketSourceTrustTier,
    notes: nullableStr(raw.notes),
  }),
  handler: async (args) => ({
    source: addMarketSource(args),
    next_actions: [`ncl markets get ${args.market_id}`],
  }),
});

register({
  name: 'market-sources-list',
  description: 'List configured sources for a market.',
  resource: 'market-sources',
  access: 'open',
  parseArgs: (raw) => ({ market_id: str(raw.market_id ?? raw['market-id'], 'market_id') }),
  handler: async (args) => ({ sources: listMarketSources(args.market_id) }),
});

function sha256(text: string): string {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFromHtml(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const title = stripHtml(match[1]);
  return title || null;
}

async function collectExactUrl(
  source: MarketSource,
  run: MarketRun,
): Promise<{ document: MarketDocument; failed: boolean }> {
  try {
    const response = await fetch(source.url, { redirect: 'follow' });
    const contentType = response.headers.get('content-type');
    if (!response.ok) {
      const document = createMarketDocument({
        market_id: source.market_id,
        source_id: source.id,
        run_id: run.id,
        url: source.url,
        canonical_url: response.url || source.url,
        title: null,
        content_text: '',
        content_hash: null,
        status: 'failed',
        error: `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
        metadata_json: JSON.stringify({ content_type: contentType }),
      });
      return { document, failed: true };
    }

    const raw = await response.text();
    const isHtml = contentType?.toLowerCase().includes('html') ?? raw.includes('<html');
    const contentText = isHtml ? stripHtml(raw) : raw;
    const document = createMarketDocument({
      market_id: source.market_id,
      source_id: source.id,
      run_id: run.id,
      url: source.url,
      canonical_url: response.url || source.url,
      title: isHtml ? titleFromHtml(raw) : null,
      content_text: contentText,
      content_hash: sha256(contentText),
      status: 'fetched',
      error: null,
      metadata_json: JSON.stringify({ content_type: contentType }),
    });
    return { document, failed: false };
  } catch (e) {
    const document = createMarketDocument({
      market_id: source.market_id,
      source_id: source.id,
      run_id: run.id,
      url: source.url,
      canonical_url: source.url,
      title: null,
      content_text: '',
      content_hash: null,
      status: 'failed',
      error: e instanceof Error ? e.message : String(e),
      metadata_json: null,
    });
    return { document, failed: true };
  }
}

register({
  name: 'market-sources-collect',
  description: 'Collect evidence documents from configured market sources.',
  resource: 'market-sources',
  access: 'open',
  parseArgs: (raw) => ({ market_id: str(raw.market_id ?? raw['market-id'], 'market_id') }),
  handler: async (args) => {
    const market = getMarket(args.market_id);
    if (!market) throw new Error(`market not found: ${args.market_id}`);

    const run = createMarketRun({
      market_id: args.market_id,
      source_id: null,
      kind: 'collection',
      status: 'running',
      summary: null,
    });
    const stored_documents: Array<{ source_id: string; url: string; status: 'fetched'; document_id: string }> = [];
    const failed: Array<{
      source_id: string;
      url: string;
      status: 'failed';
      error: string | null;
      document_id: string;
    }> = [];
    const unsupported: Array<{ source_id: string; source_type: MarketSourceType; url: string; reason: string }> = [];
    const documents: MarketDocument[] = [];
    let visited = 0;

    for (const source of listMarketSources(args.market_id).filter((item) => item.status === 'active')) {
      if (source.source_type !== 'exact_url') {
        unsupported.push({
          source_id: source.id,
          source_type: source.source_type,
          url: source.url,
          reason: `unsupported source_type for collection v1: ${source.source_type}`,
        });
        continue;
      }

      visited += 1;
      const result = await collectExactUrl(source, run);
      documents.push(result.document);
      if (result.failed) {
        failed.push({
          source_id: source.id,
          url: source.url,
          status: 'failed',
          error: result.document.error,
          document_id: result.document.id,
        });
      } else {
        stored_documents.push({
          source_id: source.id,
          url: source.url,
          status: 'fetched',
          document_id: result.document.id,
        });
      }
    }

    const summary = {
      visited,
      stored_documents: stored_documents.length,
      skipped: 0,
      failed: failed.length,
      unsupported: unsupported.length,
    };
    const completed = completeMarketRun(run.id, {
      status: 'completed',
      summary: JSON.stringify(summary),
    });

    return {
      run: completed,
      stored_documents,
      failed,
      unsupported,
      summary,
      documents,
      next_actions: [`ncl market-documents list --market-id ${args.market_id}`, `ncl markets get ${args.market_id}`],
    };
  },
});

register({
  name: 'market-documents-list',
  description: 'List collected evidence documents for a market.',
  resource: 'market-documents',
  access: 'open',
  parseArgs: (raw) => ({ market_id: str(raw.market_id ?? raw['market-id'], 'market_id') }),
  handler: async (args) => ({
    documents: listMarketDocuments(args.market_id),
    next_actions: [`ncl market-documents get <DOCUMENT_ID>`, `ncl markets get ${args.market_id}`],
  }),
});

register({
  name: 'market-documents-get',
  description: 'Get one collected evidence document.',
  resource: 'market-documents',
  access: 'open',
  parseArgs: (raw) => ({ id: str(raw.id, 'id') }),
  handler: async (args) => {
    const document = getMarketDocument(args.id);
    if (!document) throw new Error(`market document not found: ${args.id}`);
    return {
      document,
      next_actions: [`ncl markets get ${document.market_id}`],
    };
  },
});
