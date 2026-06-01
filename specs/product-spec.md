# Market Strategy Agent Product Spec

## Product Summary

The Market Strategy Agent is a local-first market intelligence workbench for product strategists. It helps a user define a market, discover relevant companies and products, categorize the market, retain evidence, and track how the market changes over time.

The product should be generic. The user defines the market during setup, such as "AI Security", "Code Security", "Cloud Cost Optimization", or any other category. AI Security is an example, not a hard-coded product scope.

The agent should not behave like an answer machine that guesses. It should gather evidence, propose structure, make uncertainty visible, and let the user review important changes.

## Current V1 Product Shape

The current implementation path uses reviewed `market_candidates` as the source of truth for market intelligence. Accepted candidates preserve evidence, confidence, review state, and review notes.

For now, the product should compute market overview output from accepted candidates without writing separate durable facts or market-map tables. Add durable facts, canonical relationship editing, or versioned market-map tables only after duplicate accepted candidates, canonical naming, recategorization history, or stable report generation creates real product pain.

Current evidence flow:

```text
market_sources
  -> market_runs
  -> market_documents
  -> market_candidates
  -> reviewed/accepted market_candidates
  -> computed market overview
```

## Primary User

The primary first user is a product strategist working for a company in or near the market being researched.

The product should optimize for:

- market overview
- category definition
- company and product tracking
- problem and capability mapping
- evidence-backed reasoning
- change detection between runs
- non-technical terminal onboarding

## Core Use Cases

1. Discover companies in a user-defined market.
   - Find relevant companies.
   - Capture their websites.
   - Produce a very short brief on what problems they solve and what solutions they apply.

2. Categorize companies and products.
   - Create a market overview by category.
   - Track both companies and products because one company may have multiple relevant offerings.
   - Propose category splits, merges, or additions as the market evolves.

3. Retain enough evidence to recategorize periodically.
   - Store source documents, extracted claims, and evidence links.
   - Preserve run history.
   - Show what changed since the previous run.
   - Support future recategorization when companies pivot or the market changes.

4. Map problems to solutions and technical capabilities.
   - Identify user problems and use cases these companies address.
   - Identify solution categories.
   - Identify technical capabilities used by products or companies.
   - Link every accepted claim to evidence.

5. Avoid guessing.
   - Every accepted company fact, product fact, category assignment, problem, or capability should have linked evidence.
   - If evidence is missing, weak, stale, or contradictory, the agent should show that explicitly.
   - Unknowns are first-class output.

6. Customize source discovery.
   - The agent should be able to use web search.
   - The user should be able to provide seed URLs.
   - The agent should be able to periodically propose additional seed URLs.
   - The architecture should support source connectors such as Slack, RSS, Google Drive, SEC filings, and other future sources.

7. Provide easy non-technical onboarding.
   - First version should run from the terminal.
   - The setup flow should be guided.
   - If the user does not provide enough setup detail, the agent may infer a draft market boundary and seed set from search, then ask the user to verify before saving durable configuration.
   - Future interfaces may include Slack, WhatsApp, or other messaging channels, ideally using NanoClaw's existing channel model.

## Setup Flow

The first-run setup should collect a guided market brief:

- market name
- market boundary
- explicit inclusions
- explicit exclusions
- seed companies
- seed URLs
- preferred or restricted source types
- desired analysis lens, such as product strategist, buyer, investor, or competitor lens

If the user omits details, the agent may infer draft values from search. Inferred setup values must be verified by the user before they become durable configuration.

## Market Boundary Management

The agent needs a durable market boundary so search results and categorization do not drift.

The boundary should define:

- what is in scope
- what is out of scope
- ambiguous adjacent categories
- preferred terminology
- known competitors or reference companies

The agent may propose updates to the boundary over time, but should not silently rewrite it.

## Source Trust and Evidence

Not all sources should be weighted equally. The product should support source trust tiers.

Suggested tiers:

- Tier 1: official company websites, docs, and blogs
- Tier 2: trusted user-provided URLs
- Tier 3: reputable third-party sources
- Tier 4: general web search results
- Tier 5: internal or private sources such as Slack, with privacy labels

The agent should retain provenance for every source:

- source type
- URL or permalink
- title
- author or organization where available
- observed timestamp
- fetched timestamp
- access level
- associated market
- associated run

## Review Workflow

The agent should separate accepted intelligence from proposed intelligence.

The product should support:

- accepted facts
- proposed facts
- rejected facts
- unknowns
- conflicts
- stale evidence

Important changes should go through review before becoming accepted state.

Examples of reviewable changes:

- new company discovered
- company removed or marked inactive
- new product discovered
- category assignment changed
- new category proposed
- category split or merge proposed
- problem or capability claim changed
- contradictory evidence found
- new seed URL proposed

## Change Detection

Each scan should compare against the previous accepted state and produce a change summary.

The change summary should include:

- new companies
- removed or inactive companies
- new products
- changed positioning
- category moves
- newly detected capabilities
- changed problems or use cases
- newly discovered sources
- contradictory evidence
- stale profiles that need refresh

## Primary Report

The primary v1 output should be a Markdown report shown in the terminal and saved to disk.

The report should include:

- market definition
- category map
- company and product table
- problem-to-solution map
- capability map
- new findings since the previous run
- proposed recategorizations
- weak, stale, contradictory, or unknown areas
- evidence appendix

## Connector and Skill Model

The source customization model should follow this design rule:

- source and connector skills produce normalized evidence
- the core turns evidence into market intelligence
- behavior skills tune the core's extraction, scoring, ranking, and reporting

Examples of connector skills:

- web search connector
- curated URL connector
- Slack connector
- RSS connector
- Google Drive connector
- SEC filings connector

Examples of behavior skills:

- product strategist lens
- buyer evaluation lens
- investor landscape lens
- competitor monitoring lens
- enterprise-readiness scoring lens

## Non-Goals for V1

- No web dashboard in v1.
- No messaging interface in v1, although the architecture should leave room for Slack, WhatsApp, or similar channels later.
- No fully autonomous hidden recategorization. Important changes should be proposed for review.
- No unsupported guesses in accepted output.
- No hard-coded AI Security-only assumptions.
