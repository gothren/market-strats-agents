# Source And Document Semantics

This note clarifies how `market_sources`, `market_runs`, and `market_documents` should work together.

## Core Concept

`market_sources` are not mainly exact URLs to fetch. A source represents a research surface or collection the agent is allowed to investigate.

`market_documents` are the individual evidence artifacts captured from that source.

```text
market_source = where the agent is allowed to look
market_run = one auditable collection attempt
market_document = one retrieved evidence artifact
```

## Source Types

Prefer explicit source types such as:

- `website`
- `docs`
- `blog`
- `rss`
- `search_query`
- `slack`
- `exact_url`
- `manual`

Avoid treating generic `url` as the long-term conceptual default.

## Documents From Crawling

When the agent crawls a docs website and visits 20 subpages, it should generally create 20 `market_documents`, one per retrieved page or content unit.

Example:

```text
market_source:
  id: msrc_docs_vendor
  type: docs
  url: https://docs.vendor.com

market_run:
  id: run_123
  source_id: msrc_docs_vendor
  kind: collection

market_documents:
  - url: https://docs.vendor.com/
    title: Vendor Docs
    source_id: msrc_docs_vendor
    run_id: run_123
    status: fetched

  - url: https://docs.vendor.com/security/prompt-injection
    title: Prompt Injection Protection
    source_id: msrc_docs_vendor
    run_id: run_123
    status: fetched

  - url: https://docs.vendor.com/integrations/slack
    title: Slack Integration
    source_id: msrc_docs_vendor
    run_id: run_123
    status: fetched
```

Do not make a single `market_document` for the whole docs site. The whole docs site is represented by the `market_source` plus a `market_run` summary. The evidence corpus should be page-level or artifact-level.

## Content Unit Rule

A `market_document` should represent one retrieved content unit:

- docs crawl: one page per document
- website crawl: one page per document
- blog: one post or article per document
- RSS: one feed entry or article per document
- Slack: one message or thread per document
- search: one fetched result page per document
- PDF or report: one PDF as a document, with chunking handled later if needed
- manual upload or note: one provided artifact as a document

## Why Page-Level Documents

One document per page or content unit gives us:

- precise provenance for later claims
- cleaner change detection via content hashes
- smaller extraction units
- better review UX
- ability to cite exact evidence pages
- ability to recategorize markets from stored evidence instead of live URLs

Extraction and categorization should operate on stored `market_documents`, not directly on live URLs.

## Agentic Crawling

The agent should be able to explore from a source. Otherwise docs, blogs, and company websites are too restrictive.

However, crawling must be bounded and auditable:

- allowed domains or same-domain restriction
- max pages
- max depth
- max runtime
- include patterns
- exclude patterns
- content type restrictions
- duplicate detection
- skip reasons
- failures

A collection run should record:

```text
source: https://docs.vendor.com
type: docs
run: 2026-05-31 crawl
visited: 37 URLs
stored_documents: 31
skipped: 6
skip reasons: out_of_scope, duplicate, unsupported_content_type
```

## Document Fields

Each `market_document` should store enough provenance for later extraction and review:

- `id`
- `market_id`
- `source_id`
- `run_id`
- `url` or connector item id
- `canonical_url` if available
- `title`
- `content_text`
- `content_hash`
- `status`: `fetched`, `failed`, maybe later `skipped`
- `error`
- `fetched_at`
- `created_at`
- optional `metadata_json`

## Exact URL

`exact_url` is still useful, but it should be explicit and exceptional.

Useful cases:

- manually flagged pages
- pricing pages
- PDFs or reports
- launch posts
- deterministic tests and debugging
- refreshing a specific cited evidence page

It should not be the default mode for company docs, blogs, or websites.

## Implementation Implication

Tests and implementation should avoid implying that normal source fetching means exact URL fetching.

Preferred direction:

- Add or adjust tests so `market_documents` represent individual retrieved artifacts.
- Use explicit source types.
- It is acceptable for the first implementation to support only `exact_url` and possibly `docs` with a shallow bounded crawl.
- Unsupported source types should return clear unsupported responses rather than being silently treated as exact URL fetches.
