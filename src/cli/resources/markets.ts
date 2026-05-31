import {
  addMarketSource,
  createMarket,
  getLatestMarketRun,
  getMarket,
  getMarketBoundary,
  listMarketSources,
  listMarkets,
  upsertMarketBoundary,
  type MarketSourceTrustTier,
  type MarketSourceType,
} from '../../db/markets.js';
import { register } from '../registry.js';

const SOURCE_TYPES = ['url', 'rss', 'search', 'slack', 'other'] as const;
const TRUST_TIERS = ['official', 'trusted', 'third_party', 'search', 'private'] as const;

function str(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`--${name.replace(/_/g, '-')} is required`);
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

function marketNextActions(marketId: string): string[] {
  return [
    `ncl market-boundaries update --market-id ${marketId} --inclusions "..." --exclusions "..."`,
    `ncl market-sources add --market-id ${marketId} --url https://example.com --source-type url --trust-tier official`,
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
      `ncl market-sources add --market-id ${args.market_id} --url https://example.com --source-type url --trust-tier official`,
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
    source_type: optionalEnum(
      raw.source_type ?? raw['source-type'],
      SOURCE_TYPES,
      'url',
      'source_type',
    ) as MarketSourceType,
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
