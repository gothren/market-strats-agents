# Core and Skills Architecture

## Normalized Core

The normalized core is more than a database shim. It is the domain engine for market intelligence. The database is only its persistence layer.

The core should provide a stable internal model and shared pipeline for market intelligence work:

1. Normalize inputs
   - Turn Slack messages, web pages, PDFs, RSS items, search results, GitHub repos, and other source material into a common `Document` or `EvidenceItem` shape.

2. Store provenance
   - Track where every piece of information came from: URL, Slack permalink, source type, timestamp, author or organization where available, fetch time, and access level.

3. Run market extraction
   - Convert normalized documents into structured records:
     - companies
     - products
     - claims
     - problems
     - capabilities
     - solution categories
     - relationships

4. Maintain the market model
   - Deduplicate entities.
   - Update relationships.
   - Version market maps.
   - Link every claim back to supporting evidence.

5. Expose stable APIs to skills and CLI commands
   - Example internal APIs:
     - `ingestDocument(...)`
     - `searchEvidence(...)`
     - `extractMarketFacts(...)`
     - `updateMarketMap(...)`
     - `getCompanyProfile(...)`

## Skills

Some skills need to know about the core, and some should not. Skills should be split into two broad categories: connector skills and behavior skills.

## Connector Skills

Connector skills add new input or output capabilities.

Examples:

- Slack source connector
- Gmail source connector
- SEC filings connector
- Crunchbase connector
- Google Drive connector

Connector skills should know only a small core ingestion interface, not the whole market model.

For example, a Slack source skill should mainly provide normalized evidence to the core:

```ts
core.ingestDocument({
  sourceType: "slack",
  externalId: "...",
  title: "...",
  text: "...",
  permalink: "...",
  observedAt: "...",
  metadata: {...}
})
```

A connector skill should not directly create companies, capabilities, claims, or market-map relationships. That keeps extraction behavior consistent across all source types.

## Behavior Skills

Behavior skills customize how the market agent thinks, scores, extracts, or reports.

Examples:

- Track AI security from a VC perspective.
- Prefer buyer pain points over vendor positioning.
- Generate consulting-style market maps.
- Treat internal Slack as high-signal but private.
- Score vendors by enterprise readiness.

Behavior skills need to understand core market concepts because they affect extraction, scoring, ranking, and reporting. Even then, they should plug into defined extension points rather than directly editing arbitrary database tables.

## Design Rule

- Source and connector skills produce normalized evidence.
- The core turns evidence into market intelligence.
- Behavior skills tune the core's extraction, scoring, ranking, and reporting.

This gives the system customization without letting every skill invent its own schema.
