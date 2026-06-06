import {
  addMarketSource,
  completeMarketRun,
  createMarketCandidate,
  createMarketDocument,
  createMarket,
  createMarketSourceProposal,
  createMarketRun,
  findExistingFetchedMarketDocument,
  findDuplicateMarketSourceProposal,
  findMarketSourceByNormalizedUrl,
  getLatestMarketRun,
  getMarket,
  getMarketBoundary,
  getMarketCandidate,
  getMarketDocument,
  getMarketSourceProposal,
  findDuplicateMarketCandidate,
  listMarketCandidates,
  listMarketDocuments,
  listMarketSourceProposals,
  listMarketSources,
  listMarketSourcesWithLatestFailedDocument,
  listMarkets,
  normalizeMarketUrl,
  reviewMarketCandidate,
  reviewMarketSourceProposal,
  summarizeMarketCandidates,
  updateMarketCandidate,
  upsertMarketBoundary,
  type MarketCandidate,
  type MarketCandidateConfidence,
  type MarketCandidateEvidence,
  type MarketCandidateStatus,
  type MarketCandidateType,
  type MarketDocument,
  type MarketRun,
  type MarketSource,
  type MarketSourceProposal,
  type MarketSourceProposalStatus,
  type MarketSourceTrustTier,
  type MarketSourceType,
} from '../../db/markets.js';
import { register } from '../registry.js';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE_TYPES = ['website', 'docs', 'blog', 'rss', 'search_query', 'slack', 'exact_url', 'manual'] as const;
const TRUST_TIERS = ['official', 'trusted', 'third_party', 'search', 'private'] as const;
const CANDIDATE_TYPES = ['company', 'product', 'problem', 'capability', 'category', 'claim'] as const;
const CANDIDATE_CONFIDENCES = ['low', 'medium', 'high'] as const;
const CANDIDATE_STATUSES = ['proposed', 'accepted', 'rejected'] as const;
const SOURCE_PROPOSAL_STATUSES = ['proposed', 'accepted', 'rejected'] as const;
const EXACT_URL_FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
};
const HELP_CENTER_FETCH_HEADERS = {
  ...EXACT_URL_FETCH_HEADERS,
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  Referer: 'https://help.openai.com/',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};
const MIN_CRAWLED_TEXT_LENGTH = 300;
const LOW_VALUE_CRAWL_PATH_FRAGMENTS = [
  '/careers',
  '/jobs',
  '/privacy',
  '/terms',
  '/legal',
  '/cookie',
  '/cookies',
  '/contact',
  '/contact-us',
  '/login',
  '/signin',
  '/signup',
  '/sign-up',
  '/register',
  '/demo',
  '/book-a-demo',
  '/request-demo',
  '/talk-to-sales',
  '/sales',
  '/get-started',
  '/events',
  '/webinars',
  '/press',
  '/newsroom',
];
const HIGH_VALUE_CRAWL_PATH_FRAGMENTS = [
  '/docs',
  '/security',
  '/product',
  '/platform',
  '/solutions',
  '/customers',
  '/case-studies',
  '/blog',
  '/changelog',
  '/integrations',
  '/pricing',
  '/developers',
  '/api',
];

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

function bool(value: unknown): boolean {
  return value === true || value === 'true' || value === '1' || value === 1;
}

function positiveInt(value: unknown, fallback: number, name: string): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    const flag = name.replace(/_/g, '-');
    throw new Error(`--${flag} (${name}) must be a positive integer`);
  }
  return parsed;
}

function optionalStr(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
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
  name: 'markets-setup',
  description: 'Validate and apply first-run market setup with boundary and seed sources.',
  resource: 'markets',
  access: 'open',
  parseArgs: (raw) => ({
    payload_file: str(raw.payload_file ?? raw['payload-file'], 'payload_file'),
    dry_run: bool(raw.dry_run ?? raw['dry-run']),
    payload: parseMarketSetupPayload(str(raw.payload_file ?? raw['payload-file'], 'payload_file')),
  }),
  handler: async (args) => {
    const { uniqueSources, skippedSources } = splitDuplicateSetupSources(args.payload.sources);

    if (args.dry_run) {
      return {
        dry_run: true,
        market: {
          id: null,
          name: args.payload.market.name,
          description: args.payload.market.description,
        },
        boundary: args.payload.boundary,
        boundary_status: args.payload.boundary ? 'planned' : 'not_provided',
        planned_sources: uniqueSources,
        added_sources: [],
        skipped_sources: skippedSources,
        next_actions: marketSetupNextActions(null),
      };
    }

    const market = createMarket(args.payload.market);
    const boundary = args.payload.boundary
      ? upsertMarketBoundary({ market_id: market.id, ...args.payload.boundary })
      : null;
    const addedSources: MarketSource[] = [];
    const skippedAfterCreate: SkippedSetupSource[] = [...skippedSources];

    for (const source of uniqueSources) {
      const existing = findMarketSourceByNormalizedUrl(market.id, source.url);
      if (existing) {
        skippedAfterCreate.push({
          url: source.url,
          normalized_url: source.normalized_url,
          reason: 'duplicate',
          duplicate_of: existing.url,
        });
        continue;
      }

      addedSources.push(
        addMarketSource({
          market_id: market.id,
          url: source.url,
          source_type: source.source_type,
          trust_tier: source.trust_tier,
          notes: source.notes,
        }),
      );
    }

    return {
      dry_run: false,
      market,
      boundary,
      boundary_status: boundary ? 'created' : 'not_provided',
      planned_sources: [],
      added_sources: addedSources,
      skipped_sources: skippedAfterCreate,
      next_actions: marketSetupNextActions(market.id),
    };
  },
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

interface ParsedSourceProposal {
  url: string;
  source_type: MarketSourceType;
  trust_tier: MarketSourceTrustTier;
  title: string | null;
  snippet: string | null;
  rationale: string;
  discovered_from: string | null;
  search_query: string | null;
  proposed_entity_name: string | null;
  proposed_entity_type: string | null;
  metadata: unknown;
}

interface ParsedMarketSetupSource {
  url: string;
  normalized_url: string;
  source_type: MarketSourceType;
  trust_tier: MarketSourceTrustTier;
  notes: string | null;
}

interface ParsedMarketSetupPayload {
  market: {
    name: string;
    description: string | null;
  };
  boundary: {
    inclusions: string | null;
    exclusions: string | null;
    adjacent_markets: string | null;
    notes: string | null;
  } | null;
  sources: ParsedMarketSetupSource[];
}

interface SkippedSetupSource {
  url: string;
  normalized_url: string;
  reason: 'duplicate';
  duplicate_of?: string;
}

function assertValidHttpUrl(value: string, fieldName: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${fieldName} must be a valid URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${fieldName} must be a valid URL`);
  }
}

function optionalObject(value: unknown, fieldName: string): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseMarketSetupPayload(path: string): ParsedMarketSetupPayload {
  const payload = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('market setup payload must be an object');
  }

  const raw = payload as Record<string, unknown>;
  const market = optionalObject(raw.market, 'market');
  if (!market) {
    throw new Error('market setup payload must include market');
  }

  const boundary = optionalObject(raw.boundary, 'boundary');
  const rawSources = raw.sources === undefined || raw.sources === null ? [] : raw.sources;
  if (!Array.isArray(rawSources)) {
    throw new Error('sources must be an array');
  }

  return {
    market: {
      name: str(market.name, 'market.name'),
      description: nullableStr(market.description),
    },
    boundary: boundary
      ? {
          inclusions: nullableStr(boundary.inclusions),
          exclusions: nullableStr(boundary.exclusions),
          adjacent_markets: nullableStr(boundary.adjacent_markets ?? boundary['adjacent-markets']),
          notes: nullableStr(boundary.notes),
        }
      : null,
    sources: rawSources.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`sources[${index}] must be an object`);
      }
      const source = item as Record<string, unknown>;
      const url = str(source.url, `sources[${index}].url`);
      assertValidHttpUrl(url, `sources[${index}].url`);
      return {
        url,
        normalized_url: normalizeMarketUrl(url),
        source_type: requiredEnum(
          source.source_type ?? source['source-type'],
          SOURCE_TYPES,
          `sources[${index}].source_type`,
        ) as MarketSourceType,
        trust_tier: requiredEnum(
          source.trust_tier ?? source['trust-tier'],
          TRUST_TIERS,
          `sources[${index}].trust_tier`,
        ) as MarketSourceTrustTier,
        notes: nullableStr(source.notes),
      };
    }),
  };
}

function splitDuplicateSetupSources(sources: ParsedMarketSetupSource[]): {
  uniqueSources: ParsedMarketSetupSource[];
  skippedSources: SkippedSetupSource[];
} {
  const seen = new Map<string, ParsedMarketSetupSource>();
  const uniqueSources: ParsedMarketSetupSource[] = [];
  const skippedSources: SkippedSetupSource[] = [];

  for (const source of sources) {
    const existing = seen.get(source.normalized_url);
    if (existing) {
      skippedSources.push({
        url: source.url,
        normalized_url: source.normalized_url,
        reason: 'duplicate',
        duplicate_of: existing.url,
      });
      continue;
    }

    seen.set(source.normalized_url, source);
    uniqueSources.push(source);
  }

  return { uniqueSources, skippedSources };
}

function marketSetupNextActions(marketId: string | null): string[] {
  if (!marketId) {
    return ['ncl markets setup --payload-file <JSON_FILE> --json'];
  }
  return [
    `ncl markets get ${marketId} --json`,
    `ncl market-sources collect --market-id ${marketId} --json`,
    `ncl market-documents list --market-id ${marketId} --compact --json`,
    `ncl market-candidates validate --market-id ${marketId} --payload-file <JSON_FILE> --dedupe --json`,
  ];
}

function sourceProposalWithParsedJson(proposal: MarketSourceProposal) {
  return {
    ...proposal,
    metadata: proposal.metadata_json ? JSON.parse(proposal.metadata_json) : null,
  };
}

function parseSourceProposalPayload(path: string): ParsedSourceProposal[] {
  const payload = JSON.parse(readFileSync(path, 'utf8')) as { proposals?: unknown };
  if (!payload || !Array.isArray(payload.proposals)) {
    throw new Error('source proposal payload must include a proposals array');
  }

  return payload.proposals.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`source proposal at index ${index} must be an object`);
    }
    const raw = item as Record<string, unknown>;
    const url = str(raw.url, `proposals[${index}].url`);
    assertValidHttpUrl(url, `proposals[${index}].url`);
    const rationale = str(raw.rationale, `proposals[${index}].rationale`);

    return {
      url,
      source_type: requiredEnum(
        raw.source_type ?? raw['source-type'],
        SOURCE_TYPES,
        `proposals[${index}].source_type`,
      ) as MarketSourceType,
      trust_tier: optionalEnum(
        raw.trust_tier ?? raw['trust-tier'],
        TRUST_TIERS,
        'search',
        `proposals[${index}].trust_tier`,
      ) as MarketSourceTrustTier,
      title: optionalStr(raw.title),
      snippet: optionalStr(raw.snippet),
      rationale,
      discovered_from: optionalStr(raw.discovered_from ?? raw['discovered-from']),
      search_query: optionalStr(raw.search_query ?? raw['search-query']),
      proposed_entity_name: optionalStr(raw.proposed_entity_name ?? raw['proposed-entity-name']),
      proposed_entity_type: optionalStr(raw.proposed_entity_type ?? raw['proposed-entity-type']),
      metadata: raw.metadata ?? null,
    };
  });
}

function parseProposalIds(value: unknown): string[] {
  const ids = str(value, 'ids')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (ids.length === 0) throw new Error('--ids (ids) must include at least one source proposal id');
  return ids;
}

function acceptSourceProposal(proposal: MarketSourceProposal, reviewNote: string | null) {
  const existing = findMarketSourceByNormalizedUrl(proposal.market_id, proposal.url);
  const source =
    existing ??
    addMarketSource({
      market_id: proposal.market_id,
      url: proposal.url,
      source_type: proposal.source_type,
      trust_tier: proposal.trust_tier,
      notes: `Accepted source proposal ${proposal.id}${proposal.rationale ? `: ${proposal.rationale}` : ''}`,
    });
  const reviewed = reviewMarketSourceProposal(proposal.id, {
    status: 'accepted',
    source_id: source.id,
    review_note: reviewNote,
  });
  return { proposal: reviewed, source };
}

register({
  name: 'market-source-proposals-import',
  description: 'Import agent-discovered source proposals from a JSON payload file.',
  resource: 'market-source-proposals',
  access: 'open',
  parseArgs: (raw) => ({
    market_id: str(raw.market_id ?? raw['market-id'], 'market_id'),
    payload_file: str(raw.payload_file ?? raw['payload-file'], 'payload_file'),
  }),
  handler: async (args) => {
    const market = getMarket(args.market_id);
    if (!market) throw new Error(`market not found: ${args.market_id}`);

    const proposals = parseSourceProposalPayload(args.payload_file);
    const imported: MarketSourceProposal[] = [];
    const skipped_duplicates: Array<{
      url: string;
      duplicate_type: 'proposal' | 'source';
      existing_id: string;
    }> = [];

    for (const proposal of proposals) {
      const duplicateProposal = findDuplicateMarketSourceProposal(args.market_id, proposal.url);
      if (duplicateProposal) {
        skipped_duplicates.push({
          url: normalizeMarketUrl(proposal.url),
          duplicate_type: 'proposal',
          existing_id: duplicateProposal.id,
        });
        continue;
      }

      const duplicateSource = findMarketSourceByNormalizedUrl(args.market_id, proposal.url);
      if (duplicateSource) {
        skipped_duplicates.push({
          url: normalizeMarketUrl(proposal.url),
          duplicate_type: 'source',
          existing_id: duplicateSource.id,
        });
        continue;
      }

      imported.push(createMarketSourceProposal({ market_id: args.market_id, ...proposal }));
    }

    return {
      summary: {
        imported: imported.length,
        skipped_duplicates: skipped_duplicates.length,
      },
      skipped_duplicates,
      proposals: imported.map(sourceProposalWithParsedJson),
      next_actions: [
        `ncl market-source-proposals list --market-id ${args.market_id} --status proposed`,
        `ncl market-source-proposals review <PROPOSAL_ID> --status accepted --review-note "..."`,
      ],
    };
  },
});

register({
  name: 'market-source-proposals-list',
  description: 'List agent-discovered source proposals for a market.',
  resource: 'market-source-proposals',
  access: 'open',
  parseArgs: (raw) => ({
    market_id: str(raw.market_id ?? raw['market-id'], 'market_id'),
    status:
      raw.status === undefined || raw.status === null || raw.status === ''
        ? null
        : (requiredEnum(raw.status, SOURCE_PROPOSAL_STATUSES, 'status') as MarketSourceProposalStatus),
  }),
  handler: async (args) => ({
    proposals: listMarketSourceProposals(args.market_id, { status: args.status }).map(sourceProposalWithParsedJson),
    next_actions: [
      `ncl market-source-proposals get <PROPOSAL_ID>`,
      `ncl market-source-proposals review <PROPOSAL_ID> --status accepted --review-note "..."`,
    ],
  }),
});

register({
  name: 'market-source-proposals-get',
  description: 'Get one agent-discovered source proposal.',
  resource: 'market-source-proposals',
  access: 'open',
  parseArgs: (raw) => ({ id: str(raw.id, 'id') }),
  handler: async (args) => {
    const proposal = getMarketSourceProposal(args.id);
    if (!proposal) throw new Error(`market source proposal not found: ${args.id}`);
    return {
      proposal: sourceProposalWithParsedJson(proposal),
      next_actions: [`ncl market-source-proposals review ${proposal.id} --status accepted --review-note "..."`],
    };
  },
});

register({
  name: 'market-source-proposals-review',
  description: 'Accept or reject one source proposal.',
  resource: 'market-source-proposals',
  access: 'open',
  parseArgs: (raw) => ({
    id: str(raw.id, 'id'),
    status: requiredEnum(raw.status, ['accepted', 'rejected'] as const, 'status') as Extract<
      MarketSourceProposalStatus,
      'accepted' | 'rejected'
    >,
    review_note: nullableStr(raw.review_note ?? raw['review-note']),
  }),
  handler: async (args) => {
    const proposal = getMarketSourceProposal(args.id);
    if (!proposal) throw new Error(`market source proposal not found: ${args.id}`);

    if (args.status === 'accepted') {
      const accepted = acceptSourceProposal(proposal, args.review_note);
      return {
        proposal: sourceProposalWithParsedJson(accepted.proposal),
        source: accepted.source,
        next_actions: [`ncl market-sources collect --market-id ${proposal.market_id}`],
      };
    }

    const rejected = reviewMarketSourceProposal(proposal.id, {
      status: 'rejected',
      source_id: null,
      review_note: args.review_note,
    });
    return {
      proposal: sourceProposalWithParsedJson(rejected),
      source: null,
      next_actions: [`ncl market-source-proposals list --market-id ${proposal.market_id} --status proposed`],
    };
  },
});

register({
  name: 'market-source-proposals-review-batch',
  description: 'Accept or reject multiple source proposals.',
  resource: 'market-source-proposals',
  access: 'open',
  parseArgs: (raw) => ({
    ids: parseProposalIds(raw.ids),
    status: requiredEnum(raw.status, ['accepted', 'rejected'] as const, 'status') as Extract<
      MarketSourceProposalStatus,
      'accepted' | 'rejected'
    >,
    review_note: nullableStr(raw.review_note ?? raw['review-note']),
  }),
  handler: async (args) => {
    const reviewed: Array<{ id: string; status: MarketSourceProposalStatus; source_id: string | null }> = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const id of args.ids) {
      try {
        const proposal = getMarketSourceProposal(id);
        if (!proposal) throw new Error(`market source proposal not found: ${id}`);
        const result =
          args.status === 'accepted'
            ? acceptSourceProposal(proposal, args.review_note).proposal
            : reviewMarketSourceProposal(proposal.id, {
                status: 'rejected',
                source_id: null,
                review_note: args.review_note,
              });
        reviewed.push({ id: result.id, status: result.status, source_id: result.source_id });
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return {
      reviewed,
      failed,
      summary: {
        requested: args.ids.length,
        reviewed: reviewed.length,
        failed: failed.length,
      },
    };
  },
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

function isHelpCenterArticleUrl(url: string): boolean {
  try {
    return /^\/[a-z]{2}(?:-[a-z]{2})?\/articles\/\d+/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

async function fetchExactUrl(source: MarketSource): Promise<{ response: Response; fetchProfile: string }> {
  const response = await fetch(source.url, { headers: EXACT_URL_FETCH_HEADERS, redirect: 'follow' });
  if (response.status !== 403 || !isHelpCenterArticleUrl(source.url)) {
    return { response, fetchProfile: 'default_browser_like' };
  }

  return {
    response: await fetch(source.url, { headers: HELP_CENTER_FETCH_HEADERS, redirect: 'follow' }),
    fetchProfile: 'help_center_browser',
  };
}

async function fetchCrawlUrl(url: string): Promise<{ response: Response; fetchProfile: string }> {
  return {
    response: await fetch(url, { headers: EXACT_URL_FETCH_HEADERS, redirect: 'follow' }),
    fetchProfile: 'default_browser_like',
  };
}

async function collectExactUrl(
  source: MarketSource,
  run: MarketRun,
): Promise<{ outcome: 'stored' | 'unchanged' | 'failed'; document: MarketDocument }> {
  try {
    const { response, fetchProfile } = await fetchExactUrl(source);
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
        metadata_json: JSON.stringify({ content_type: contentType, fetch_profile: fetchProfile }),
      });
      return { document, outcome: 'failed' };
    }

    const raw = await response.text();
    const isHtml = contentType?.toLowerCase().includes('html') ?? raw.includes('<html');
    const contentText = isHtml ? stripHtml(raw) : raw;
    const canonicalUrl = response.url || source.url;
    const contentHash = sha256(contentText);
    const existing = findExistingFetchedMarketDocument({
      source_id: source.id,
      canonical_url: canonicalUrl,
      content_hash: contentHash,
    });
    if (existing) return { document: existing, outcome: 'unchanged' };

    const document = createMarketDocument({
      market_id: source.market_id,
      source_id: source.id,
      run_id: run.id,
      url: source.url,
      canonical_url: canonicalUrl,
      title: isHtml ? titleFromHtml(raw) : null,
      content_text: contentText,
      content_hash: contentHash,
      status: 'fetched',
      error: null,
      metadata_json: JSON.stringify({ content_type: contentType, fetch_profile: fetchProfile }),
    });
    return { document, outcome: 'stored' };
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
    return { document, outcome: 'failed' };
  }
}

interface CollectedDocumentResult {
  outcome: 'stored' | 'unchanged' | 'failed' | 'skipped';
  document?: MarketDocument;
  url: string;
  reason?: string;
}

async function storeFetchedPage(args: {
  source: MarketSource;
  run: MarketRun;
  url: string;
  response: Response;
  fetchProfile: string;
  depth: number;
}): Promise<CollectedDocumentResult> {
  const contentType = args.response.headers.get('content-type');
  const canonicalUrl = normalizeCrawlUrl(args.response.url || args.url, args.url) ?? args.url;
  if (!args.response.ok) {
    const document = createMarketDocument({
      market_id: args.source.market_id,
      source_id: args.source.id,
      run_id: args.run.id,
      url: args.url,
      canonical_url: canonicalUrl,
      title: null,
      content_text: '',
      content_hash: null,
      status: 'failed',
      error: `HTTP ${args.response.status}${args.response.statusText ? ` ${args.response.statusText}` : ''}`,
      metadata_json: JSON.stringify({
        content_type: contentType,
        fetch_profile: args.fetchProfile,
        source_type: args.source.source_type,
        depth: args.depth,
      }),
    });
    return { outcome: 'failed', document, url: args.url };
  }

  if (!contentType?.toLowerCase().includes('html')) {
    return { outcome: 'skipped', url: args.url, reason: 'unsupported_content_type' };
  }

  const raw = await args.response.text();
  const contentText = stripHtml(raw);
  if (contentText.length < MIN_CRAWLED_TEXT_LENGTH) {
    return { outcome: 'skipped', url: args.url, reason: 'low_quality_content' };
  }

  const contentHash = sha256(contentText);
  const existing = findExistingFetchedMarketDocument({
    source_id: args.source.id,
    canonical_url: canonicalUrl,
    content_hash: contentHash,
  });
  if (existing) return { outcome: 'unchanged', document: existing, url: args.url };

  const document = createMarketDocument({
    market_id: args.source.market_id,
    source_id: args.source.id,
    run_id: args.run.id,
    url: args.url,
    canonical_url: canonicalUrl,
    title: titleFromHtml(raw),
    content_text: contentText,
    content_hash: contentHash,
    status: 'fetched',
    error: null,
    metadata_json: JSON.stringify({
      content_type: contentType,
      fetch_profile: args.fetchProfile,
      source_type: args.source.source_type,
      depth: args.depth,
    }),
  });
  return { outcome: 'stored', document, url: args.url };
}

function normalizeCrawlUrl(input: string, base: string): string | null {
  try {
    const url = new URL(input, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/g, '');
    }
    return url.toString();
  } catch {
    return null;
  }
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const pattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+))/gi;
  for (const match of html.matchAll(pattern)) {
    const normalized = normalizeCrawlUrl(match[1] ?? match[2] ?? match[3], baseUrl);
    if (normalized) links.push(normalized);
  }
  return links;
}

function isLowValueCrawlUrl(url: string): boolean {
  const path = new URL(url).pathname.toLowerCase();
  return LOW_VALUE_CRAWL_PATH_FRAGMENTS.some((fragment) => path.includes(fragment));
}

function highValueCrawlScore(url: string): number {
  const path = new URL(url).pathname.toLowerCase();
  return HIGH_VALUE_CRAWL_PATH_FRAGMENTS.reduce(
    (score, fragment, index) =>
      path.includes(fragment) ? Math.max(score, HIGH_VALUE_CRAWL_PATH_FRAGMENTS.length - index) : score,
    0,
  );
}

function prioritizeCrawlLinks(links: string[]): string[] {
  return links
    .map((url, index) => ({ url, index, score: highValueCrawlScore(url) }))
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url) || a.index - b.index)
    .map((item) => item.url);
}

async function collectCrawlSource(args: {
  source: MarketSource;
  run: MarketRun;
  maxPages: number;
  maxDepth: number;
}): Promise<{
  results: CollectedDocumentResult[];
  skippedUrls: Array<{ source_id: string; url: string; reason: string }>;
  visited: number;
}> {
  const startUrl = normalizeCrawlUrl(args.source.url, args.source.url);
  if (!startUrl) {
    return {
      results: [],
      skippedUrls: [{ source_id: args.source.id, url: args.source.url, reason: 'invalid_url' }],
      visited: 0,
    };
  }

  const origin = new URL(startUrl).origin;
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
  const seen = new Set<string>();
  const results: CollectedDocumentResult[] = [];
  const skippedUrls: Array<{ source_id: string; url: string; reason: string }> = [];
  let visited = 0;

  while (queue.length > 0) {
    if (visited >= args.maxPages) {
      for (const queued of queue) {
        skippedUrls.push({ source_id: args.source.id, url: queued.url, reason: 'max_pages' });
      }
      break;
    }

    const current = queue.shift()!;
    if (seen.has(current.url)) {
      skippedUrls.push({ source_id: args.source.id, url: current.url, reason: 'duplicate' });
      continue;
    }
    if (isLowValueCrawlUrl(current.url)) {
      seen.add(current.url);
      skippedUrls.push({ source_id: args.source.id, url: current.url, reason: 'excluded_low_value_path' });
      continue;
    }
    seen.add(current.url);
    visited += 1;

    try {
      const fetched = await fetchCrawlUrl(current.url);
      const contentType = fetched.response.headers.get('content-type');
      const raw =
        fetched.response.ok && contentType?.toLowerCase().includes('html') ? await fetched.response.text() : null;
      const pageResponse =
        raw === null
          ? fetched.response
          : new Response(raw, {
              status: fetched.response.status,
              statusText: fetched.response.statusText,
              headers: fetched.response.headers,
            });
      const result = await storeFetchedPage({
        source: args.source,
        run: args.run,
        url: current.url,
        response: pageResponse,
        fetchProfile: fetched.fetchProfile,
        depth: current.depth,
      });
      results.push(result);

      if (result.outcome === 'skipped') {
        skippedUrls.push({
          source_id: args.source.id,
          url: result.url,
          reason: result.reason ?? 'skipped',
        });
      }

      if (raw === null) continue;

      for (const link of prioritizeCrawlLinks(extractLinks(raw, current.url))) {
        if (new URL(link).origin !== origin) {
          skippedUrls.push({ source_id: args.source.id, url: link, reason: 'out_of_scope' });
        } else if (isLowValueCrawlUrl(link)) {
          skippedUrls.push({ source_id: args.source.id, url: link, reason: 'excluded_low_value_path' });
        } else if (seen.has(link) || queue.some((item) => item.url === link)) {
          skippedUrls.push({ source_id: args.source.id, url: link, reason: 'duplicate' });
        } else if (current.depth + 1 > args.maxDepth) {
          skippedUrls.push({ source_id: args.source.id, url: link, reason: 'max_depth' });
        } else {
          queue.push({ url: link, depth: current.depth + 1 });
        }
      }
    } catch (e) {
      const document = createMarketDocument({
        market_id: args.source.market_id,
        source_id: args.source.id,
        run_id: args.run.id,
        url: current.url,
        canonical_url: current.url,
        title: null,
        content_text: '',
        content_hash: null,
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
        metadata_json: JSON.stringify({
          fetch_profile: 'default_browser_like',
          source_type: args.source.source_type,
          depth: current.depth,
        }),
      });
      results.push({ outcome: 'failed', document, url: current.url });
    }
  }

  return { results, skippedUrls, visited };
}

register({
  name: 'market-sources-collect',
  description: 'Collect evidence documents from configured market sources.',
  resource: 'market-sources',
  access: 'open',
  parseArgs: (raw) => ({
    market_id: str(raw.market_id ?? raw['market-id'], 'market_id'),
    failed_only: bool(raw.failed_only ?? raw['failed-only']),
    max_pages: positiveInt(raw.max_pages ?? raw['max-pages'], 10, 'max_pages'),
    max_depth: positiveInt(raw.max_depth ?? raw['max-depth'], 1, 'max_depth'),
  }),
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
    const unchanged_documents: Array<{ source_id: string; url: string; status: 'unchanged'; document_id: string }> = [];
    const failed: Array<{
      source_id: string;
      url: string;
      status: 'failed';
      error: string | null;
      document_id: string;
    }> = [];
    const unsupported: Array<{ source_id: string; source_type: MarketSourceType; url: string; reason: string }> = [];
    const skipped_urls: Array<{ source_id: string; url: string; reason: string }> = [];
    const documents: MarketDocument[] = [];
    let visited = 0;
    const sources = args.failed_only
      ? listMarketSourcesWithLatestFailedDocument(args.market_id)
      : listMarketSources(args.market_id).filter((item) => item.status === 'active');

    for (const source of sources) {
      if (!['exact_url', 'website', 'docs'].includes(source.source_type)) {
        unsupported.push({
          source_id: source.id,
          source_type: source.source_type,
          url: source.url,
          reason: `unsupported source_type for collection v1: ${source.source_type}`,
        });
        continue;
      }

      if (source.source_type === 'exact_url') {
        visited += 1;
        const result = await collectExactUrl(source, run);
        if (result.outcome === 'failed') {
          documents.push(result.document);
          failed.push({
            source_id: source.id,
            url: source.url,
            status: 'failed',
            error: result.document.error,
            document_id: result.document.id,
          });
        } else if (result.outcome === 'unchanged') {
          unchanged_documents.push({
            source_id: source.id,
            url: source.url,
            status: 'unchanged',
            document_id: result.document.id,
          });
        } else {
          documents.push(result.document);
          stored_documents.push({
            source_id: source.id,
            url: source.url,
            status: 'fetched',
            document_id: result.document.id,
          });
        }
      } else {
        const crawl = await collectCrawlSource({
          source,
          run,
          maxPages: args.max_pages,
          maxDepth: args.max_depth,
        });
        visited += crawl.visited;
        skipped_urls.push(...crawl.skippedUrls);
        for (const result of crawl.results) {
          if (result.outcome === 'failed' && result.document) {
            documents.push(result.document);
            failed.push({
              source_id: source.id,
              url: result.url,
              status: 'failed',
              error: result.document.error,
              document_id: result.document.id,
            });
          } else if (result.outcome === 'unchanged' && result.document) {
            unchanged_documents.push({
              source_id: source.id,
              url: result.url,
              status: 'unchanged',
              document_id: result.document.id,
            });
          } else if (result.outcome === 'stored' && result.document) {
            documents.push(result.document);
            stored_documents.push({
              source_id: source.id,
              url: result.url,
              status: 'fetched',
              document_id: result.document.id,
            });
          }
        }
      }
    }

    const summary = {
      visited,
      stored_documents: stored_documents.length,
      unchanged_documents: unchanged_documents.length,
      unchanged: unchanged_documents.map((document) => ({
        source_id: document.source_id,
        document_id: document.document_id,
      })),
      skipped: skipped_urls.length,
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
      unchanged_documents,
      failed,
      unsupported,
      skipped_urls,
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
  parseArgs: (raw) => ({
    market_id: str(raw.market_id ?? raw['market-id'], 'market_id'),
    compact: bool(raw.compact),
  }),
  handler: async (args) => ({
    documents: listMarketDocuments(args.market_id).map((document) =>
      args.compact ? compactDocument(document) : document,
    ),
    next_actions: [`ncl market-documents get <DOCUMENT_ID>`, `ncl markets get ${args.market_id}`],
  }),
});

function compactDocument(document: MarketDocument) {
  return {
    id: document.id,
    market_id: document.market_id,
    source_id: document.source_id,
    run_id: document.run_id,
    title: document.title,
    status: document.status,
    error: document.error,
    url: document.url,
    canonical_url: document.canonical_url,
  };
}

function normalizeSearchText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function searchTokenStem(value: string): string {
  let token = value.toLowerCase();
  if (token.length > 6 && token.endsWith('ing')) token = token.slice(0, -3);
  else if (token.length > 5 && token.endsWith('ed')) token = token.slice(0, -2);
  else if (token.length > 4 && token.endsWith('es')) token = token.slice(0, -2);
  else if (token.length > 3 && token.endsWith('s')) token = token.slice(0, -1);
  return token;
}

function searchTokens(value: string): string[] {
  return Array.from(value.toLowerCase().matchAll(/[a-z0-9]+/g), (match) => searchTokenStem(match[0]));
}

function uniqueSearchTokens(value: string): string[] {
  return Array.from(new Set(searchTokens(value)));
}

function excerptAroundIndex(value: string, index: number, length: number, radius = 90): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(value.length, index + length + radius);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < value.length ? '...' : '';
  return `${prefix}${value.slice(start, end)}${suffix}`;
}

function tokenIndex(value: string, token: string): { index: number; length: number } | null {
  for (const match of value.matchAll(/[a-z0-9]+/gi)) {
    if (searchTokenStem(match[0]) === token) {
      return { index: match.index, length: match[0].length };
    }
  }
  return null;
}

function findDocumentSearchMatch(
  document: MarketDocument,
  query: string,
): { excerpt: string; match_type: 'phrase' | 'tokens'; matched_terms: string[] } | null {
  const fields = [document.content_text, document.title, document.url, document.canonical_url].filter(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  const needle = query.toLowerCase();

  for (const field of fields) {
    const normalized = normalizeSearchText(field);
    const index = normalized.toLowerCase().indexOf(needle);
    if (index === -1) continue;

    return {
      excerpt: excerptAroundIndex(normalized, index, query.length),
      match_type: 'phrase',
      matched_terms: [query],
    };
  }

  const queryTokens = uniqueSearchTokens(query);
  if (queryTokens.length === 0) return null;
  const documentTokens = new Set(searchTokens(fields.join(' ')));
  if (!queryTokens.every((token) => documentTokens.has(token))) return null;

  for (const field of fields) {
    const normalized = normalizeSearchText(field);
    const firstToken = queryTokens.map((token) => tokenIndex(normalized, token)).find((match) => match !== null);
    if (!firstToken) continue;

    return {
      excerpt: excerptAroundIndex(normalized, firstToken.index, firstToken.length),
      match_type: 'tokens',
      matched_terms: queryTokens,
    };
  }

  return null;
}

register({
  name: 'market-documents-search',
  description: 'Search stored fetched market documents and return compact evidence excerpts.',
  resource: 'market-documents',
  access: 'open',
  parseArgs: (raw) => ({
    market_id: str(raw.market_id ?? raw['market-id'], 'market_id'),
    query: str(raw.query, 'query'),
    limit: positiveInt(raw.limit, 10, 'limit'),
  }),
  handler: async (args) => {
    const documents = listMarketDocuments(args.market_id);
    const fetchedDocuments = documents.filter((document) => document.status === 'fetched');
    const matches = fetchedDocuments
      .map((document) => ({ document, match: findDocumentSearchMatch(document, args.query) }))
      .filter(
        (item): item is { document: MarketDocument; match: NonNullable<ReturnType<typeof findDocumentSearchMatch>> } =>
          item.match !== null,
      );

    return {
      matches: matches.slice(0, args.limit).map(({ document, match }) => ({
        ...compactDocument(document),
        match_type: match.match_type,
        matched_terms: match.matched_terms,
        excerpts: [match.excerpt],
      })),
      summary: {
        market_id: args.market_id,
        query: args.query,
        total_documents: documents.length,
        searched_documents: fetchedDocuments.length,
        matches: matches.length,
        returned: Math.min(matches.length, args.limit),
      },
      next_actions: [
        `ncl market-documents get <DOCUMENT_ID>`,
        `ncl market-candidates validate --market-id ${args.market_id}`,
      ],
    };
  },
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

interface CandidatePayloadItem {
  candidate_type: MarketCandidateType;
  name: string;
  summary: string | null;
  confidence: MarketCandidateConfidence;
  evidence: MarketCandidateEvidence[];
  metadata: unknown;
}

function parseJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`could not read JSON payload file: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function normalizeEvidence(value: unknown): MarketCandidateEvidence[] {
  if (!Array.isArray(value)) {
    throw new Error('candidate evidence must be an array');
  }
  return value.map((item, index) => {
    const record = asRecord(item, `candidate evidence ${index}`);
    return {
      document_id: str(record.document_id, 'document_id'),
      quote: optionalStr(record.quote),
      note: optionalStr(record.note),
    };
  });
}

function normalizeCandidate(value: unknown, index: number): CandidatePayloadItem {
  const record = asRecord(value, `candidate ${index}`);
  return {
    candidate_type: requiredEnum(record.candidate_type, CANDIDATE_TYPES, 'candidate_type') as MarketCandidateType,
    name: str(record.name, 'name'),
    summary: nullableStr(record.summary),
    confidence: requiredEnum(record.confidence, CANDIDATE_CONFIDENCES, 'confidence') as MarketCandidateConfidence,
    evidence: normalizeEvidence(record.evidence),
    metadata: record.metadata ?? null,
  };
}

function parseCandidatePayload(path: string): CandidatePayloadItem[] {
  const payload = asRecord(parseJsonFile(path), 'candidate payload');
  if (!Array.isArray(payload.candidates)) {
    throw new Error('candidate payload candidates must be an array');
  }
  return payload.candidates.map((candidate, index) => normalizeCandidate(candidate, index));
}

function parseCandidateUpdatePayload(path: string): CandidatePayloadItem {
  const payload = parseJsonFile(path);
  const record = asRecord(payload, 'candidate update payload');
  return normalizeCandidate(record.candidate ?? record, 0);
}

function candidateWithParsedJson(candidate: MarketCandidate) {
  return {
    ...candidate,
    evidence: JSON.parse(candidate.evidence_json) as MarketCandidateEvidence[],
    metadata: candidate.metadata_json ? (JSON.parse(candidate.metadata_json) as unknown) : null,
  };
}

function compactCandidate(candidate: MarketCandidate) {
  return {
    id: candidate.id,
    candidate_type: candidate.candidate_type,
    name: candidate.name,
    summary: candidate.summary,
    confidence: candidate.confidence,
    status: candidate.status,
  };
}

type MarketCandidateMapGroups = Record<
  'companies' | 'products' | 'problems' | 'capabilities' | 'categories' | 'claims',
  Array<{
    id: string;
    name: string;
    summary: string | null;
    confidence: MarketCandidateConfidence;
    review_note: string | null;
    evidence: MarketCandidateEvidence[];
  }>
>;

const CANDIDATE_MAP_GROUPS: Record<MarketCandidateType, keyof MarketCandidateMapGroups> = {
  company: 'companies',
  product: 'products',
  problem: 'problems',
  capability: 'capabilities',
  category: 'categories',
  claim: 'claims',
};

function emptyCandidateMapGroups(): MarketCandidateMapGroups {
  return {
    companies: [],
    products: [],
    problems: [],
    capabilities: [],
    categories: [],
    claims: [],
  };
}

function marketCandidateMapItem(candidate: MarketCandidate) {
  return {
    id: candidate.id,
    name: candidate.name,
    summary: candidate.summary,
    confidence: candidate.confidence,
    review_note: candidate.review_note,
    evidence: JSON.parse(candidate.evidence_json) as MarketCandidateEvidence[],
  };
}

function markdownTableCell(value: string | null | undefined): string {
  return (value?.trim() || 'Not specified').replace(/\|/g, '\\|').replace(/\s+/g, ' ');
}

function candidateEvidence(candidate: MarketCandidate): MarketCandidateEvidence[] {
  return JSON.parse(candidate.evidence_json) as MarketCandidateEvidence[];
}

function markdownCandidateTable(candidates: MarketCandidate[], emptyMessage: string): string[] {
  if (candidates.length === 0) return [emptyMessage];

  return [
    '| Name | Summary | Confidence | Candidate ID |',
    '| --- | --- | --- | --- |',
    ...candidates.map(
      (candidate) =>
        `| ${markdownTableCell(candidate.name)} | ${markdownTableCell(candidate.summary)} | ${candidate.confidence} | ${candidate.id} |`,
    ),
  ];
}

function markdownCandidateBullets(candidates: MarketCandidate[], emptyMessage: string): string[] {
  if (candidates.length === 0) return [emptyMessage];

  return candidates.map(
    (candidate) =>
      `- ${candidate.name} (${candidate.confidence}, ${candidate.id}): ${candidate.summary?.trim() || 'No summary.'}`,
  );
}

function renderMarketCandidateReport(input: {
  market: NonNullable<ReturnType<typeof getMarket>>;
  candidates: MarketCandidate[];
}): string {
  const boundary = getMarketBoundary(input.market.id);
  const companies = input.candidates.filter((candidate) => candidate.candidate_type === 'company');
  const products = input.candidates.filter((candidate) => candidate.candidate_type === 'product');
  const problems = input.candidates.filter((candidate) => candidate.candidate_type === 'problem');
  const capabilities = input.candidates.filter((candidate) => candidate.candidate_type === 'capability');
  const categories = input.candidates.filter((candidate) => candidate.candidate_type === 'category');
  const claims = input.candidates.filter((candidate) => candidate.candidate_type === 'claim');
  const lines: string[] = [];

  lines.push(`# Market Report: ${input.market.name}`);
  lines.push('');
  lines.push('## Market Definition');
  lines.push(`- Description: ${input.market.description?.trim() || 'Not specified.'}`);
  lines.push(`- Inclusions: ${boundary?.inclusions?.trim() || 'Not specified.'}`);
  lines.push(`- Exclusions: ${boundary?.exclusions?.trim() || 'Not specified.'}`);
  lines.push(`- Adjacent markets: ${boundary?.adjacent_markets?.trim() || 'Not specified.'}`);
  lines.push('');
  lines.push('## Category Map');
  lines.push(...markdownCandidateBullets(categories, 'No accepted categories yet.'));
  lines.push('');
  lines.push('## Companies And Products');
  lines.push(...markdownCandidateTable([...companies, ...products], 'No accepted companies or products yet.'));
  lines.push('');
  lines.push('## Problem-To-Solution Map');
  lines.push('No reviewed problem-to-solution relationships are inferred in v1.');
  lines.push('');
  lines.push('### Problems');
  lines.push(...markdownCandidateBullets(problems, 'No accepted problems yet.'));
  lines.push('');
  lines.push('### Capabilities');
  lines.push(...markdownCandidateBullets(capabilities, 'No accepted capabilities yet.'));
  lines.push('');
  lines.push('## Evidence-Backed Claims');
  lines.push(...markdownCandidateBullets(claims, 'No accepted claims yet.'));
  lines.push('');
  lines.push('## Known Gaps');
  if (input.candidates.length === 0) {
    lines.push('- No accepted candidates yet.');
  } else {
    if (companies.length === 0) lines.push('- No accepted companies yet.');
    if (products.length === 0) lines.push('- No accepted products yet.');
    if (problems.length === 0) lines.push('- No accepted problems yet.');
    if (capabilities.length === 0) lines.push('- No accepted capabilities yet.');
    if (categories.length === 0) lines.push('- No accepted categories yet.');
    if (claims.length === 0) lines.push('- No accepted claims yet.');
    if ([companies, products, problems, capabilities, categories, claims].every((group) => group.length > 0)) {
      lines.push('- No structural gaps detected from accepted candidate types.');
    }
  }
  lines.push('');
  lines.push('## Evidence Appendix');
  if (input.candidates.length === 0) {
    lines.push('No accepted candidate evidence yet.');
  } else {
    for (const candidate of input.candidates) {
      for (const evidence of candidateEvidence(candidate)) {
        const quote = evidence.quote?.trim() ? `: "${evidence.quote.trim()}"` : '';
        const note = evidence.note?.trim() ? ` (${evidence.note.trim()})` : '';
        lines.push(`- ${candidate.id} / ${evidence.document_id}${quote}${note}`);
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

function normalizeCandidateDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function normalizedCandidateName(name: string): string {
  return normalizeCandidateDisplayName(name).toLowerCase();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function parsedCandidateMetadata(candidate: MarketCandidate): Record<string, unknown> | null {
  if (!candidate.metadata_json) return null;
  const metadata = JSON.parse(candidate.metadata_json) as unknown;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return metadata as Record<string, unknown>;
}

function candidateStableKey(candidate: MarketCandidate): string | null {
  const metadata = parsedCandidateMetadata(candidate);
  const stableKey = metadata?.stable_key;
  return typeof stableKey === 'string' && stableKey.trim() !== '' ? stableKey.trim() : null;
}

function fallbackCandidateKey(candidate: MarketCandidate): string {
  return `${candidate.candidate_type}:${normalizedCandidateName(candidate.name)}`;
}

function candidateIdentityKey(candidate: MarketCandidate): string {
  const stableKey = candidateStableKey(candidate);
  return stableKey ? `stable:${stableKey}` : `fallback:${fallbackCandidateKey(candidate)}`;
}

function parseIds(value: unknown): string[] {
  const ids = str(value, 'ids')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (ids.length === 0) throw new Error('--ids (ids) must include at least one candidate id');
  return ids;
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  return values.reduce(
    (acc, value) => {
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    },
    {} as Record<T, number>,
  );
}

type CandidateAuditSeverity = 'low' | 'medium' | 'high';
type CandidateAuditReason =
  | 'low_confidence'
  | 'missing_summary'
  | 'short_summary'
  | 'generic_name'
  | 'single_evidence'
  | 'missing_evidence_quote'
  | 'weak_evidence_quote'
  | 'evidence_document_missing'
  | 'evidence_document_not_fetched'
  | 'evidence_quote_not_found'
  | 'duplicate_name';

const CANDIDATE_AUDIT_SEVERITIES = ['low', 'medium', 'high'] as const;
const CANDIDATE_AUDIT_REASONS = [
  'low_confidence',
  'missing_summary',
  'short_summary',
  'generic_name',
  'single_evidence',
  'missing_evidence_quote',
  'weak_evidence_quote',
  'evidence_document_missing',
  'evidence_document_not_fetched',
  'evidence_quote_not_found',
  'duplicate_name',
] as const;

const GENERIC_CANDIDATE_NAMES = new Set([
  'ai',
  'ai security',
  'application',
  'compliance',
  'dashboard',
  'platform',
  'product',
  'security',
  'solution',
  'tool',
]);

function normalizedCandidateKey(candidate: MarketCandidate): string {
  return fallbackCandidateKey(candidate);
}

function candidateKeyItem(candidate: MarketCandidate) {
  const stable_key = candidateStableKey(candidate);
  const fallback_key = fallbackCandidateKey(candidate);
  return {
    candidate_id: candidate.id,
    candidate_type: candidate.candidate_type,
    name: candidate.name,
    summary: candidate.summary,
    confidence: candidate.confidence,
    status: candidate.status,
    review_note: candidate.review_note,
    stable_key,
    fallback_key,
    identity_key: candidateIdentityKey(candidate),
  };
}

type CandidateChangeClassification = 'new' | 'duplicate' | 'changed';
type CandidateChangeMatchMethod = 'stable_key' | 'fallback_key' | null;
const CANDIDATE_CHANGE_CLASSIFICATIONS = ['new', 'duplicate', 'changed'] as const;

function normalizedEvidenceForComparison(candidate: MarketCandidate): MarketCandidateEvidence[] {
  return candidateEvidence(candidate)
    .map((item) => ({
      document_id: item.document_id,
      quote: item.quote?.trim() || null,
      note: item.note?.trim() || null,
    }))
    .sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
}

function changedCandidateFields(accepted: MarketCandidate, proposed: MarketCandidate): string[] {
  const changed: string[] = [];
  if (normalizedCandidateName(accepted.name) !== normalizedCandidateName(proposed.name)) {
    changed.push('name');
  }
  if ((accepted.summary?.trim() || null) !== (proposed.summary?.trim() || null)) {
    changed.push('summary');
  }
  if (accepted.confidence !== proposed.confidence) {
    changed.push('confidence');
  }
  if (stableJson(normalizedEvidenceForComparison(accepted)) !== stableJson(normalizedEvidenceForComparison(proposed))) {
    changed.push('evidence');
  }
  if (stableJson(parsedCandidateMetadata(accepted)) !== stableJson(parsedCandidateMetadata(proposed))) {
    changed.push('metadata');
  }
  return changed;
}

function recommendedCandidateChangeAction(input: {
  classification: CandidateChangeClassification;
  missing_stable_key: boolean;
}): string {
  if (input.missing_stable_key) {
    return 'Update proposed candidate metadata with metadata.stable_key before review if the identity is known.';
  }
  if (input.classification === 'duplicate') {
    return 'Reject the proposed duplicate unless the user explicitly wants a separate candidate.';
  }
  if (input.classification === 'changed') {
    return 'Inspect changed fields and evidence, then decide whether to update the accepted candidate or reject the proposed candidate.';
  }
  return 'Audit this proposed candidate, then review it for acceptance if the evidence supports it.';
}

function candidateChangeItem(input: {
  proposed: MarketCandidate;
  accepted: MarketCandidate | null;
  match_method: CandidateChangeMatchMethod;
}) {
  const stable_key = candidateStableKey(input.proposed);
  const fallback_key = fallbackCandidateKey(input.proposed);
  const changed_fields = input.accepted ? changedCandidateFields(input.accepted, input.proposed) : [];
  const classification: CandidateChangeClassification = input.accepted
    ? changed_fields.length > 0
      ? 'changed'
      : 'duplicate'
    : 'new';
  const warnings = [];
  if (!stable_key) {
    warnings.push({
      reason: 'missing_stable_key',
      message: 'Proposed candidate has no metadata.stable_key; matching fell back to normalized type and name.',
    });
  }
  const recommended_action = recommendedCandidateChangeAction({
    classification,
    missing_stable_key: !stable_key,
  });

  return {
    classification,
    proposed_candidate: compactCandidate(input.proposed),
    accepted_candidate_id: input.accepted?.id ?? null,
    accepted_candidate: input.accepted ? compactCandidate(input.accepted) : null,
    match_method: input.match_method,
    stable_key,
    fallback_key,
    identity_key: candidateIdentityKey(input.proposed),
    changed_fields,
    warnings,
    recommended_action,
    suggested_action: recommended_action,
  };
}

function normalizedQuoteText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function candidateIsReadyForReview(findings: Array<{ severity: CandidateAuditSeverity }>): boolean {
  return findings.every((finding) => finding.severity === 'low');
}

function auditFinding(input: {
  candidate: MarketCandidate;
  severity: CandidateAuditSeverity;
  reason: CandidateAuditReason;
  message: string;
  suggested_action: string;
  evidence_document_id?: string;
  related_candidate_ids?: string[];
}) {
  return {
    candidate_id: input.candidate.id,
    candidate_type: input.candidate.candidate_type,
    name: input.candidate.name,
    status: input.candidate.status,
    severity: input.severity,
    reason: input.reason,
    message: input.message,
    suggested_action: input.suggested_action,
    ...(input.evidence_document_id ? { evidence_document_id: input.evidence_document_id } : {}),
    ...(input.related_candidate_ids ? { related_candidate_ids: input.related_candidate_ids } : {}),
  };
}

function auditCandidate(candidate: MarketCandidate, duplicatesById: Map<string, string[]>) {
  const evidence = JSON.parse(candidate.evidence_json) as MarketCandidateEvidence[];
  const findings: Array<ReturnType<typeof auditFinding>> = [];
  const summary = candidate.summary?.trim() ?? '';

  if (candidate.confidence === 'low') {
    findings.push(
      auditFinding({
        candidate,
        severity: 'low',
        reason: 'low_confidence',
        message: 'Candidate confidence is low.',
        suggested_action: 'Inspect the evidence and consider improving, rejecting, or leaving it for user review.',
      }),
    );
  }

  if (summary === '') {
    findings.push(
      auditFinding({
        candidate,
        severity: 'medium',
        reason: 'missing_summary',
        message: 'Candidate has no summary.',
        suggested_action: 'Inspect evidence and add a short evidence-backed summary before review.',
      }),
    );
  } else if (summary.length < 30) {
    findings.push(
      auditFinding({
        candidate,
        severity: 'low',
        reason: 'short_summary',
        message: 'Candidate summary is very short.',
        suggested_action: 'Inspect evidence and expand the summary if the candidate is worth keeping.',
      }),
    );
  }

  if (GENERIC_CANDIDATE_NAMES.has(candidate.name.trim().toLowerCase().replace(/\s+/g, ' '))) {
    findings.push(
      auditFinding({
        candidate,
        severity: 'medium',
        reason: 'generic_name',
        message: 'Candidate name is generic.',
        suggested_action:
          'Rename the candidate to the specific company, product, problem, capability, category, or claim.',
      }),
    );
  }

  if (evidence.length === 1) {
    findings.push(
      auditFinding({
        candidate,
        severity: 'low',
        reason: 'single_evidence',
        message: 'Candidate has only one evidence reference.',
        suggested_action: 'Consider finding another supporting document or keep this candidate for closer review.',
      }),
    );
  }

  for (const item of evidence) {
    const quote = item.quote?.trim() ?? '';
    const document = getMarketDocument(item.document_id);
    if (!document) {
      findings.push(
        auditFinding({
          candidate,
          severity: 'high',
          reason: 'evidence_document_missing',
          message: `Evidence document was not found: ${item.document_id}.`,
          suggested_action: 'Remove the evidence reference or validate/import the candidate payload again.',
          evidence_document_id: item.document_id,
        }),
      );
      continue;
    }
    if (document.status !== 'fetched') {
      findings.push(
        auditFinding({
          candidate,
          severity: 'medium',
          reason: 'evidence_document_not_fetched',
          message: `Evidence document is not fetched: ${item.document_id}.`,
          suggested_action: 'Use a fetched evidence document or recollect the source before review.',
          evidence_document_id: item.document_id,
        }),
      );
    }
    if (quote === '') {
      findings.push(
        auditFinding({
          candidate,
          severity: 'medium',
          reason: 'missing_evidence_quote',
          message: 'Candidate evidence has no quote.',
          suggested_action: 'Use market-documents search/get to add a short supporting quote.',
          evidence_document_id: item.document_id,
        }),
      );
    } else {
      if (quote.length < 20) {
        findings.push(
          auditFinding({
            candidate,
            severity: 'low',
            reason: 'weak_evidence_quote',
            message: 'Candidate evidence quote is very short.',
            suggested_action: 'Use market-documents get to replace it with a more specific supporting excerpt.',
            evidence_document_id: item.document_id,
          }),
        );
      }
      if (!normalizedQuoteText(document.content_text).includes(normalizedQuoteText(quote))) {
        findings.push(
          auditFinding({
            candidate,
            severity: 'medium',
            reason: 'evidence_quote_not_found',
            message: 'Candidate evidence quote was not found in the stored document text.',
            suggested_action: 'Inspect the document and update the quote so it exactly supports the candidate.',
            evidence_document_id: item.document_id,
          }),
        );
      }
    }
  }

  const related = duplicatesById.get(candidate.id) ?? [];
  if (related.length > 0) {
    findings.push(
      auditFinding({
        candidate,
        severity: 'medium',
        reason: 'duplicate_name',
        message: 'Candidate has another candidate with the same normalized name and type.',
        suggested_action: 'Compare related candidates and reject or consolidate duplicates before review.',
        related_candidate_ids: related,
      }),
    );
  }

  return findings;
}

function duplicateCandidateIds(candidates: MarketCandidate[]): Map<string, string[]> {
  const groups = new Map<string, MarketCandidate[]>();
  for (const candidate of candidates) {
    const key = normalizedCandidateKey(candidate);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  const duplicates = new Map<string, string[]>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const candidate of group) {
      duplicates.set(
        candidate.id,
        group.filter((item) => item.id !== candidate.id).map((item) => item.id),
      );
    }
  }
  return duplicates;
}

function candidatePayloadPreview(candidate: CandidatePayloadItem) {
  return {
    candidate_type: candidate.candidate_type,
    name: normalizeCandidateDisplayName(candidate.name),
    summary: candidate.summary,
    confidence: candidate.confidence,
    evidence_count: candidate.evidence.length,
  };
}

function validateCandidateEvidence(
  marketId: string,
  candidate: CandidatePayloadItem,
  index: number,
): Array<{ index: number; candidate_type: MarketCandidateType; name: string; message: string }> {
  if (candidate.evidence.length === 0) {
    return [
      {
        index,
        candidate_type: candidate.candidate_type,
        name: normalizeCandidateDisplayName(candidate.name),
        message: 'candidate evidence must include at least one market document',
      },
    ];
  }

  const errors: Array<{ index: number; candidate_type: MarketCandidateType; name: string; message: string }> = [];
  for (const item of candidate.evidence) {
    const document = getMarketDocument(item.document_id);
    if (!document) {
      errors.push({
        index,
        candidate_type: candidate.candidate_type,
        name: normalizeCandidateDisplayName(candidate.name),
        message: `candidate evidence document not found: ${item.document_id}`,
      });
      continue;
    }
    if (document.market_id !== marketId) {
      errors.push({
        index,
        candidate_type: candidate.candidate_type,
        name: normalizeCandidateDisplayName(candidate.name),
        message: `candidate evidence document belongs to a different market: ${item.document_id}`,
      });
    }
  }
  return errors;
}

register({
  name: 'market-candidates-validate',
  description: 'Validate an evidence-backed extraction candidate payload without importing it.',
  resource: 'market-candidates',
  access: 'open',
  parseArgs: (raw) => ({
    market_id: str(raw.market_id ?? raw['market-id'], 'market_id'),
    payload_file: str(raw.payload_file ?? raw['payload-file'], 'payload_file'),
    dedupe: bool(raw.dedupe),
  }),
  handler: async (args) => {
    const market = getMarket(args.market_id);
    if (!market) throw new Error(`market not found: ${args.market_id}`);

    const candidates = parseCandidatePayload(args.payload_file);
    const errors: Array<{ index: number; candidate_type: MarketCandidateType; name: string; message: string }> = [];
    const importable_candidates: Array<ReturnType<typeof candidatePayloadPreview>> = [];
    const duplicate_candidates: Array<ReturnType<typeof candidatePayloadPreview> & { existing_id: string }> = [];

    candidates.forEach((candidate, index) => {
      const evidenceErrors = validateCandidateEvidence(args.market_id, candidate, index);
      if (evidenceErrors.length > 0) {
        errors.push(...evidenceErrors);
        return;
      }

      const duplicate = args.dedupe
        ? findDuplicateMarketCandidate(args.market_id, candidate.candidate_type, candidate.name)
        : undefined;
      if (duplicate) {
        duplicate_candidates.push({
          ...candidatePayloadPreview(candidate),
          existing_id: duplicate.id,
        });
        return;
      }

      importable_candidates.push(candidatePayloadPreview(candidate));
    });

    return {
      valid: errors.length === 0,
      summary: {
        total: candidates.length,
        importable: importable_candidates.length,
        duplicate_count: duplicate_candidates.length,
        error_count: errors.length,
        by_type: countBy(candidates.map((candidate) => candidate.candidate_type)),
        by_confidence: countBy(candidates.map((candidate) => candidate.confidence)),
      },
      importable_candidates,
      duplicate_candidates,
      errors,
      next_actions:
        errors.length === 0
          ? [
              `ncl market-candidates import --market-id ${args.market_id} --payload-file ${args.payload_file}${
                args.dedupe ? ' --dedupe' : ''
              }`,
            ]
          : [
              `Fix validation errors and rerun ncl market-candidates validate --market-id ${args.market_id} --payload-file ${args.payload_file}`,
            ],
    };
  },
});

register({
  name: 'market-candidates-import',
  description: 'Import evidence-backed extraction candidates from a batch JSON payload file.',
  resource: 'market-candidates',
  access: 'open',
  parseArgs: (raw) => ({
    market_id: str(raw.market_id ?? raw['market-id'], 'market_id'),
    payload_file: str(raw.payload_file ?? raw['payload-file'], 'payload_file'),
    dedupe: bool(raw.dedupe),
  }),
  handler: async (args) => {
    const market = getMarket(args.market_id);
    if (!market) throw new Error(`market not found: ${args.market_id}`);

    const candidates = parseCandidatePayload(args.payload_file);
    const run = createMarketRun({
      market_id: args.market_id,
      source_id: null,
      kind: 'extraction',
      status: 'running',
      summary: null,
    });

    try {
      const imported: MarketCandidate[] = [];
      const skipped_duplicates: Array<{ candidate_type: MarketCandidateType; name: string; existing_id: string }> = [];
      for (const candidate of candidates) {
        const duplicate = args.dedupe
          ? findDuplicateMarketCandidate(args.market_id, candidate.candidate_type, candidate.name)
          : undefined;
        if (duplicate) {
          skipped_duplicates.push({
            candidate_type: candidate.candidate_type,
            name: normalizeCandidateDisplayName(candidate.name),
            existing_id: duplicate.id,
          });
          continue;
        }
        imported.push(
          createMarketCandidate({
            market_id: args.market_id,
            run_id: run.id,
            candidate_type: candidate.candidate_type,
            name: candidate.name,
            summary: candidate.summary,
            confidence: candidate.confidence,
            evidence: candidate.evidence,
            metadata: candidate.metadata,
          }),
        );
      }
      const summary = {
        imported: imported.length,
        skipped_duplicates: skipped_duplicates.length,
        by_type: countBy(imported.map((candidate) => candidate.candidate_type)),
        by_confidence: countBy(imported.map((candidate) => candidate.confidence)),
      };
      const completed = completeMarketRun(run.id, { status: 'completed', summary: JSON.stringify(summary) });
      return {
        run: completed,
        summary,
        skipped_duplicates,
        candidates: imported.map(candidateWithParsedJson),
        next_actions: [`ncl market-candidates list --market-id ${args.market_id}`, `ncl markets get ${args.market_id}`],
      };
    } catch (e) {
      completeMarketRun(run.id, {
        status: 'failed',
        summary: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      });
      throw e;
    }
  },
});

register({
  name: 'market-candidates-list',
  description: 'List evidence-backed extraction candidates for a market.',
  resource: 'market-candidates',
  access: 'open',
  parseArgs: (raw) => ({
    market_id: str(raw.market_id ?? raw['market-id'], 'market_id'),
    status:
      raw.status === undefined || raw.status === null || raw.status === ''
        ? null
        : (requiredEnum(raw.status, CANDIDATE_STATUSES, 'status') as MarketCandidateStatus),
    candidate_type:
      raw.type === undefined || raw.type === null || raw.type === ''
        ? null
        : (requiredEnum(raw.type, CANDIDATE_TYPES, 'type') as MarketCandidateType),
    compact: bool(raw.compact),
  }),
  handler: async (args) => ({
    candidates: listMarketCandidates(args.market_id, {
      status: args.status,
      candidate_type: args.candidate_type,
    }).map((candidate) => (args.compact ? compactCandidate(candidate) : candidateWithParsedJson(candidate))),
    next_actions: [`ncl market-candidates get <CANDIDATE_ID>`, `ncl markets get ${args.market_id}`],
  }),
});

register({
  name: 'market-candidates-summary',
  description: 'Summarize evidence-backed extraction candidates for a market.',
  resource: 'market-candidates',
  access: 'open',
  parseArgs: (raw) => ({ market_id: str(raw.market_id ?? raw['market-id'], 'market_id') }),
  handler: async (args) => summarizeMarketCandidates(args.market_id),
});

register({
  name: 'market-candidates-keys',
  description: 'List accepted candidate identity keys for agent reuse across extraction runs.',
  resource: 'market-candidates',
  access: 'open',
  parseArgs: (raw) => ({ market_id: str(raw.market_id ?? raw['market-id'], 'market_id') }),
  handler: async (args) => {
    const market = getMarket(args.market_id);
    if (!market) throw new Error(`market not found: ${args.market_id}`);

    const accepted = listMarketCandidates(args.market_id, { status: 'accepted' });
    const keys = accepted.map(candidateKeyItem);
    const missingStableKey = keys.filter((item) => item.stable_key === null);

    return {
      market_id: args.market_id,
      status: 'accepted',
      summary: {
        total: accepted.length,
        with_stable_key: keys.length - missingStableKey.length,
        missing_stable_key: missingStableKey.length,
        by_type: countBy(accepted.map((candidate) => candidate.candidate_type)),
      },
      keys,
      warnings: missingStableKey.map((item) => ({
        candidate_id: item.candidate_id,
        candidate_type: item.candidate_type,
        name: item.name,
        reason: 'missing_stable_key',
        message:
          'Accepted candidate has no metadata.stable_key; future matching will rely on normalized type and name.',
      })),
      next_actions: [
        `ncl market-candidates list --market-id ${args.market_id} --status proposed --compact`,
        `ncl market-candidates changes --market-id ${args.market_id}`,
      ],
    };
  },
});

register({
  name: 'market-candidates-changes',
  description: 'Compare proposed candidates against accepted candidates without mutating review state.',
  resource: 'market-candidates',
  access: 'open',
  parseArgs: (raw) => ({
    market_id: str(raw.market_id ?? raw['market-id'], 'market_id'),
    classification:
      raw.classification === undefined || raw.classification === null || raw.classification === ''
        ? null
        : (requiredEnum(
            raw.classification,
            CANDIDATE_CHANGE_CLASSIFICATIONS,
            'classification',
          ) as CandidateChangeClassification),
    missing_stable_key:
      raw.missing_stable_key === undefined && raw['missing-stable-key'] === undefined
        ? null
        : bool(raw.missing_stable_key ?? raw['missing-stable-key']),
  }),
  handler: async (args) => {
    const market = getMarket(args.market_id);
    if (!market) throw new Error(`market not found: ${args.market_id}`);

    const accepted = listMarketCandidates(args.market_id, { status: 'accepted' });
    const proposed = listMarketCandidates(args.market_id, { status: 'proposed' });
    const acceptedByStableKey = new Map<string, MarketCandidate>();
    const acceptedByFallbackKey = new Map<string, MarketCandidate>();
    for (const candidate of accepted) {
      const stableKey = candidateStableKey(candidate);
      if (stableKey && !acceptedByStableKey.has(stableKey)) {
        acceptedByStableKey.set(stableKey, candidate);
      }
      const fallbackKey = fallbackCandidateKey(candidate);
      if (!acceptedByFallbackKey.has(fallbackKey)) {
        acceptedByFallbackKey.set(fallbackKey, candidate);
      }
    }

    const changes = proposed.map((candidate) => {
      const stableKey = candidateStableKey(candidate);
      const fallbackKey = fallbackCandidateKey(candidate);
      const acceptedByStable = stableKey ? acceptedByStableKey.get(stableKey) : undefined;
      if (acceptedByStable) {
        return candidateChangeItem({ proposed: candidate, accepted: acceptedByStable, match_method: 'stable_key' });
      }
      const acceptedByFallback = acceptedByFallbackKey.get(fallbackKey);
      if (acceptedByFallback) {
        return candidateChangeItem({ proposed: candidate, accepted: acceptedByFallback, match_method: 'fallback_key' });
      }
      return candidateChangeItem({ proposed: candidate, accepted: null, match_method: null });
    });
    const visibleChanges = changes.filter((change) => {
      if (args.classification && change.classification !== args.classification) return false;
      if (args.missing_stable_key !== null && (change.stable_key === null) !== args.missing_stable_key) return false;
      return true;
    });

    return {
      market_id: args.market_id,
      baseline_status: 'accepted',
      proposed_status: 'proposed',
      summary: {
        accepted_total: accepted.length,
        proposed_total: proposed.length,
        new: changes.filter((item) => item.classification === 'new').length,
        duplicate: changes.filter((item) => item.classification === 'duplicate').length,
        changed: changes.filter((item) => item.classification === 'changed').length,
        proposed_missing_stable_key: proposed.filter((candidate) => !candidateStableKey(candidate)).length,
        visible_total: visibleChanges.length,
        filters: {
          classification: args.classification,
          missing_stable_key: args.missing_stable_key,
        },
        by_type: countBy(proposed.map((candidate) => candidate.candidate_type)),
      },
      changes: visibleChanges,
      next_actions: [
        `ncl market-candidates keys --market-id ${args.market_id}`,
        `ncl market-candidates audit --market-id ${args.market_id}`,
        `ncl market-candidates get <CANDIDATE_ID>`,
      ],
    };
  },
});

register({
  name: 'market-candidates-audit',
  description: 'Audit proposed market candidates for deterministic quality guardrails.',
  resource: 'market-candidates',
  access: 'open',
  parseArgs: (raw) => ({
    market_id: str(raw.market_id ?? raw['market-id'], 'market_id'),
    status:
      raw.status === undefined || raw.status === null || raw.status === ''
        ? ('proposed' as MarketCandidateStatus)
        : (requiredEnum(raw.status, CANDIDATE_STATUSES, 'status') as MarketCandidateStatus),
    severity:
      raw.severity === undefined || raw.severity === null || raw.severity === ''
        ? null
        : (requiredEnum(raw.severity, CANDIDATE_AUDIT_SEVERITIES, 'severity') as CandidateAuditSeverity),
    reason:
      raw.reason === undefined || raw.reason === null || raw.reason === ''
        ? null
        : (requiredEnum(raw.reason, CANDIDATE_AUDIT_REASONS, 'reason') as CandidateAuditReason),
    ready: raw.ready === undefined || raw.ready === null || raw.ready === '' ? null : bool(raw.ready),
  }),
  handler: async (args) => {
    const market = getMarket(args.market_id);
    if (!market) throw new Error(`market not found: ${args.market_id}`);

    const candidates = listMarketCandidates(args.market_id, { status: args.status });
    const duplicatesById = duplicateCandidateIds(candidates);
    const candidatesWithFindings = candidates.map((candidate) => {
      const findings = auditCandidate(candidate, duplicatesById);
      return { candidate, findings, ready_for_review: candidateIsReadyForReview(findings) };
    });
    const visibleCandidates = candidatesWithFindings
      .map((item) => ({
        ...item,
        visible_findings: item.findings.filter((finding) => {
          if (args.severity && finding.severity !== args.severity) return false;
          if (args.reason && finding.reason !== args.reason) return false;
          return true;
        }),
      }))
      .filter((item) => {
        if (args.ready !== null && item.ready_for_review !== args.ready) return false;
        if ((args.severity || args.reason) && item.visible_findings.length === 0) return false;
        return true;
      });
    const findings = visibleCandidates.flatMap((item) => item.visible_findings);

    return {
      summary: {
        market_id: args.market_id,
        status: args.status,
        total: visibleCandidates.length,
        ready_for_review: visibleCandidates.filter((item) => item.ready_for_review).length,
        needs_attention: visibleCandidates.filter((item) => !item.ready_for_review).length,
        findings: findings.length,
        by_reason: countBy(findings.map((finding) => finding.reason)),
        by_severity: countBy(findings.map((finding) => finding.severity)),
        filters: {
          severity: args.severity,
          reason: args.reason,
          ready: args.ready,
        },
      },
      candidates: visibleCandidates.map(({ candidate, visible_findings, ready_for_review }) => ({
        ...compactCandidate(candidate),
        ready_for_review,
        finding_count: visible_findings.length,
        reasons: Array.from(new Set(visible_findings.map((finding) => finding.reason))),
      })),
      findings,
      next_actions: [
        `ncl market-candidates list --market-id ${args.market_id} --status ${args.status} --compact`,
        `ncl market-candidates get <CANDIDATE_ID>`,
        `ncl market-documents search --market-id ${args.market_id} --query "..."`,
      ],
    };
  },
});

register({
  name: 'market-candidates-map',
  description: 'Compute a read-only market overview from accepted candidates.',
  resource: 'market-candidates',
  access: 'open',
  parseArgs: (raw) => ({ market_id: str(raw.market_id ?? raw['market-id'], 'market_id') }),
  handler: async (args) => {
    const market = getMarket(args.market_id);
    if (!market) throw new Error(`market not found: ${args.market_id}`);

    const accepted = listMarketCandidates(args.market_id, { status: 'accepted' });
    const groups = emptyCandidateMapGroups();
    for (const candidate of accepted) {
      groups[CANDIDATE_MAP_GROUPS[candidate.candidate_type]].push(marketCandidateMapItem(candidate));
    }

    return {
      market_id: args.market_id,
      status: 'accepted',
      groups,
      summary: {
        total: accepted.length,
        by_type: countBy(accepted.map((candidate) => candidate.candidate_type)),
      },
      next_actions: [
        `ncl market-candidates summary --market-id ${args.market_id}`,
        `ncl market-candidates list --market-id ${args.market_id} --status proposed --compact`,
      ],
    };
  },
});

register({
  name: 'market-candidates-report',
  description: 'Generate a read-only Markdown market report from accepted candidates.',
  resource: 'market-candidates',
  access: 'open',
  parseArgs: (raw) => ({
    market_id: str(raw.market_id ?? raw['market-id'], 'market_id'),
    format:
      raw.format === undefined || raw.format === null || raw.format === ''
        ? 'markdown'
        : requiredEnum(raw.format, ['markdown'] as const, 'format'),
    output_file: optionalStr(raw.output_file ?? raw['output-file']),
  }),
  handler: async (args) => {
    const market = getMarket(args.market_id);
    if (!market) throw new Error(`market not found: ${args.market_id}`);

    const accepted = listMarketCandidates(args.market_id, { status: 'accepted' });
    const markdown = renderMarketCandidateReport({ market, candidates: accepted });
    if (args.output_file) {
      writeFileSync(args.output_file, markdown, 'utf8');
    }

    return {
      market_id: args.market_id,
      status: 'accepted',
      format: args.format,
      output_file: args.output_file,
      markdown,
      summary: {
        total: accepted.length,
        by_type: countBy(accepted.map((candidate) => candidate.candidate_type)),
      },
      next_actions: [
        `ncl market-candidates map --market-id ${args.market_id}`,
        `ncl market-candidates list --market-id ${args.market_id} --status proposed --compact`,
      ],
    };
  },
});

register({
  name: 'market-candidates-get',
  description: 'Get one evidence-backed extraction candidate.',
  resource: 'market-candidates',
  access: 'open',
  parseArgs: (raw) => ({ id: str(raw.id, 'id') }),
  handler: async (args) => {
    const candidate = getMarketCandidate(args.id);
    if (!candidate) throw new Error(`market candidate not found: ${args.id}`);
    return {
      candidate: candidateWithParsedJson(candidate),
      next_actions: [
        `ncl market-candidates review ${candidate.id} --status accepted --review-note "..."`,
        `ncl markets get ${candidate.market_id}`,
      ],
    };
  },
});

register({
  name: 'market-candidates-update',
  description: 'Replace one candidate extracted-content payload without changing review status.',
  resource: 'market-candidates',
  access: 'open',
  parseArgs: (raw) => ({
    id: str(raw.id, 'id'),
    payload_file: str(raw.payload_file ?? raw['payload-file'], 'payload_file'),
  }),
  handler: async (args) => {
    const existing = getMarketCandidate(args.id);
    if (!existing) throw new Error(`market candidate not found: ${args.id}`);

    const payload = parseCandidateUpdatePayload(args.payload_file);
    const evidenceErrors = validateCandidateEvidence(existing.market_id, payload, 0);
    if (evidenceErrors.length > 0) {
      throw new Error(evidenceErrors.map((error) => error.message).join('; '));
    }

    const candidate = updateMarketCandidate(args.id, {
      candidate_type: payload.candidate_type,
      name: payload.name,
      summary: payload.summary,
      confidence: payload.confidence,
      evidence: payload.evidence,
      metadata: payload.metadata,
    });

    return {
      candidate: candidateWithParsedJson(candidate),
      next_actions: [
        `ncl market-candidates audit --market-id ${candidate.market_id}`,
        `ncl market-candidates get ${candidate.id}`,
      ],
    };
  },
});

register({
  name: 'market-candidates-review',
  description: 'Update review status for one extraction candidate.',
  resource: 'market-candidates',
  access: 'open',
  parseArgs: (raw) => ({
    id: str(raw.id, 'id'),
    status: requiredEnum(raw.status, CANDIDATE_STATUSES, 'status') as MarketCandidateStatus,
    review_note: nullableStr(raw.review_note ?? raw['review-note']),
  }),
  handler: async (args) => {
    const candidate = reviewMarketCandidate(args.id, {
      status: args.status,
      review_note: args.review_note,
    });
    return {
      candidate: candidateWithParsedJson(candidate),
      next_actions: [`ncl market-candidates list --market-id ${candidate.market_id}`],
    };
  },
});

register({
  name: 'market-candidates-review-batch',
  description: 'Update review status for multiple extraction candidates.',
  resource: 'market-candidates',
  access: 'open',
  parseArgs: (raw) => ({
    ids: parseIds(raw.ids),
    status: requiredEnum(raw.status, ['accepted', 'rejected'] as const, 'status') as Extract<
      MarketCandidateStatus,
      'accepted' | 'rejected'
    >,
    review_note: nullableStr(raw.review_note ?? raw['review-note']),
  }),
  handler: async (args) => {
    const reviewed: Array<{ id: string; status: MarketCandidateStatus }> = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const id of args.ids) {
      try {
        const candidate = reviewMarketCandidate(id, {
          status: args.status,
          review_note: args.review_note,
        });
        reviewed.push({ id: candidate.id, status: candidate.status });
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return {
      reviewed,
      failed,
      summary: {
        requested: args.ids.length,
        reviewed: reviewed.length,
        failed: failed.length,
      },
    };
  },
});
