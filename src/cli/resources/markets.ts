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
import { readFileSync } from 'node:fs';

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

function normalizeCandidateDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
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
