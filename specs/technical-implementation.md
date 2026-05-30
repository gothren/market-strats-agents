# NanoClaw-Based Market Strategy Agent Plan

## Summary

- Start with a thin fork of NanoClaw rather than a greenfield app.
- Keep NanoClaw's useful base: container-isolated agents, scheduled tasks, local CLI flow, SQLite message queues, and skill-based extension model.
- Add a market-intelligence subsystem in TypeScript inside the fork, with Postgres + pgvector for durable market data, evidence, relationships, and semantic retrieval.
- Make the LLM layer provider-agnostic from day one, with adapters for OpenAI and Claude rather than business logic depending on either provider directly.
- First interface is local CLI, not messaging or web UI.
- Build for generic user-defined markets. "AI Security" is only an example, not a hard-coded scope.
- Treat the product as a market intelligence workbench: gather evidence, propose structure, make uncertainty visible, and require review for important changes.

## Key Technology Decisions

- Base: fork `nanocoai/nanoclaw` as a thin fork.
  - Preserve upstream structure where possible.
  - Add market-specific modules rather than rewriting the assistant harness.
  - Source reference: https://github.com/nanocoai/nanoclaw
- Runtime: TypeScript/Bun/Node-compatible code, following NanoClaw's existing stack.
- Storage:
  - Keep NanoClaw's existing SQLite queue/session architecture.
  - Add Postgres for market intelligence records.
  - Use `pgvector` for embeddings and semantic retrieval.
  - Use Drizzle ORM for schema/migrations and typed database access.
- LLM abstraction:
  - Define a `ModelProvider` interface for chat, structured extraction, embeddings, and tool calls.
  - Implement OpenAI and Claude adapters.
  - Market-agent logic calls only the provider interface.
- Search abstraction:
  - Define a `SearchProvider` interface.
  - Ship with one default web-search adapter behind configuration.
  - Keep curated URL ingestion as a first-class path, not just a fallback.
- References:
  - NanoClaw architecture: https://github.com/nanocoai/nanoclaw
  - NanoClaw docs: https://docs.nanoclaw.dev/llms.txt
  - pgvector: https://github.com/pgvector/pgvector
  - OpenAI Agents SDK: https://platform.openai.com/docs/guides/agents-sdk/

## Market Intelligence Additions

- Add a market workspace model:
  - `markets`
  - `market_boundaries`
  - `sources`
  - `source_trust_tiers`
  - `documents`
  - `entities`
  - `companies`
  - `products`
  - `problems`
  - `solution_categories`
  - `capabilities`
  - `claims`
  - `evidence`
  - `relationships`
  - `market_map_versions`
  - `review_items`
  - `change_sets`
  - `agent_runs`
- Track review state for market intelligence records:
  - accepted
  - proposed
  - rejected
  - unknown
  - conflict
  - stale
- Track provenance and trust for every source:
  - source type
  - URL or permalink
  - title
  - author or organization where available
  - observed timestamp
  - fetched timestamp
  - access level
  - trust tier
  - associated market
  - associated run
- Add CLI commands:
  - `market setup`
  - `market create <name>`
  - `market boundary <market>`
  - `market add-source <market> <url-or-feed>`
  - `market enrich-sources <market>`
  - `market scan <market>`
  - `market review <market>`
  - `market map <market>`
  - `market brief <market>`
  - `market changes <market>`
  - `market evidence <entity-or-claim>`
- `market setup` should provide guided onboarding for non-technical users:
  - market name
  - market boundary
  - explicit inclusions
  - explicit exclusions
  - seed companies
  - seed URLs
  - preferred or restricted source types
  - desired analysis lens
- If setup information is missing, the agent may infer draft market boundaries, seed companies, and seed URLs from search. Inferred setup values must be shown to the user for verification before becoming durable configuration.
- Add pipeline stages:
  - ingest curated URLs and search results
  - normalize documents
  - extract structured market facts
  - separate accepted facts from proposed facts
  - resolve duplicate entities
  - link claims to evidence
  - detect weak, stale, missing, or contradictory evidence
  - propose category additions, splits, merges, and recategorizations
  - update the market map
  - compute diffs against the previous accepted state
  - generate CLI-readable reports
- First target workflow:
  - User creates a market, such as "AI Security", "Code Security", or another user-defined category.
  - User completes guided setup, or lets the agent infer a draft setup from search.
  - User verifies inferred market boundary and seed sources.
  - User adds known sources and optionally enables web search.
  - Agent scans sources
  - Agent extracts companies, products, problems, solutions, capabilities, and evidence
  - Agent proposes new facts, categories, and source additions for review
  - User accepts or rejects important changes
  - Agent outputs a versioned market map, change summary, and Markdown briefing

## Test Plan

- Unit test provider interfaces with mocked OpenAI/Claude adapters.
- Unit test search-provider interface with fixed fake search results.
- Unit test extraction schemas with valid, partial, and malformed model outputs.
- Unit test no-guessing enforcement: accepted facts, category assignments, problems, and capabilities require linked evidence.
- Unit test review state transitions for accepted, proposed, rejected, unknown, conflict, and stale records.
- Integration test Postgres schema creation, inserts, relationship queries, and pgvector similarity lookup.
- End-to-end CLI test:
  - create a market
  - run guided setup
  - ingest fixture documents
  - extract companies/products/capabilities/problems
  - propose review items
  - accept selected review items
  - generate a market map
  - generate a Markdown report
  - run a second scan and verify change detection
  - verify every generated claim has evidence
- Regression test that NanoClaw's existing CLI/session behavior still works after adding the market modules.

## Assumptions

- The fork should remain close enough to upstream NanoClaw that future upstream merges are still plausible.
- First version is single-user/local-first.
- First version is generic across user-defined markets.
- No web dashboard in v1.
- No messaging interface in v1, although the architecture should leave room for Slack, WhatsApp, and similar channels later.
- No Neo4j in v1; graph-like market maps are represented in Postgres tables first.
- No dedicated vector DB in v1; pgvector is sufficient until retrieval scale or hybrid-search needs justify Qdrant.
- Market outputs must be evidence-backed; summaries without source links are not acceptable as durable intelligence.
- Important changes are proposed for review before becoming accepted state.
- The primary v1 output is a Markdown report shown in the terminal and saved to disk.
