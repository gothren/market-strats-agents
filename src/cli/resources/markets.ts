import {
  addMarketSource,
  completeMarketRun,
  createMarketCandidate,
  createMarketDocument,
  createMarket,
  createMarketRun,
  getLatestMarketRun,
  getMarket,
  getMarketBoundary,
  getMarketCandidate,
  getMarketDocument,
  findDuplicateMarketCandidate,
  listMarketCandidates,
  listMarketDocuments,
  listMarketSources,
  listMarketSourcesWithLatestFailedDocument,
  listMarkets,
  reviewMarketCandidate,
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
const EXACT_URL_FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
};

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
    const response = await fetch(source.url, { headers: EXACT_URL_FETCH_HEADERS, redirect: 'follow' });
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
  parseArgs: (raw) => ({
    market_id: str(raw.market_id ?? raw['market-id'], 'market_id'),
    failed_only: bool(raw.failed_only ?? raw['failed-only']),
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
    const sources = args.failed_only
      ? listMarketSourcesWithLatestFailedDocument(args.market_id)
      : listMarketSources(args.market_id).filter((item) => item.status === 'active');

    for (const source of sources) {
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
