# Market Strategy Agent Product Spec

## Product Summary

The Market Strategy Agent is an agent-operated market intelligence product for product strategists. A user talks to an agent through Codex, Claude Code, NanoClaw, Slack, WhatsApp, or similar channels. The agent uses durable market tools to define markets, discover sources, collect evidence, extract intelligence, review uncertainty, and produce market reports.

The product is generic across user-defined markets. "AI Security" is an example market, not a hard-coded scope.

The product must not guess. Durable intelligence should be grounded in stored evidence. When evidence is weak, stale, contradictory, or missing, the agent should expose that uncertainty and ask the user only when judgment is needed.

## Operating Modes

The product must support two modes.

### 1. Manual / User Prompt-Driven Mode

The entire workflow is chat-driven. The user works with Codex, Claude Code, or another coding/automation agent that has the market CLI available.

After each meaningful step, the agent should summarize what happened and propose the next action with clear options, such as search for sources, review proposed sources, crawl accepted sources, extract candidates, review uncertain candidates, generate a report, or ask an ad-hoc question.

Core manual workflows:

1. Add a market.
   - The agent guides the user through market creation.
   - The agent captures market name, description, inclusions, exclusions, adjacent markets, notes, and seed sources.

2. Search for market sources.
   - The user asks the agent to search for sources.
   - The agent uses external search tools, records search history, and imports findings as source proposals.
   - The agent should auto-approve or reject low-ambiguity proposals using documented policy.
   - The agent asks the user only when it has doubts.
   - When user review is needed, the agent presents a recommendation.

3. Improve source discovery for an existing market.
   - The user asks the agent to improve prior results.
   - The agent reads market context and search history, avoids repeating recent searches, searches stale or uncovered areas, and handles proposals as in the normal source-search workflow.

4. Crawl market sources.
   - The user asks the agent to crawl accepted sources.
   - The agent collects evidence from supported source types and reports a concise crawl summary.

5. Improve crawling for an existing market.
   - The user asks the agent to crawl again or improve crawl results.
   - The agent reads crawl context, continues open frontier when useful, refreshes stale sources when useful, and reports the outcome.

6. Extract data from crawled documents.
   - The user asks the agent to extract companies, products, problems, capabilities, categories, and claims.
   - The agent reads stored documents, creates evidence-backed candidates, validates/imports them, audits them, and auto-approves candidates that meet documented policy.
   - The agent asks the user to review only candidates it has doubts about.

7. Generate a market report.
   - The user asks for a report.
   - The agent generates JSON overview output or a Markdown report from accepted candidates.
   - The agent writes requested report files to disk.

8. Answer ad-hoc market questions.
   - The user asks about a market, company, capability, problem, category, source, or evidence item.
   - The agent answers from stored evidence and accepted candidates when possible, cites or references evidence, and says when the stored evidence is insufficient.

### 2. Agent Autonomous Workflow

The workflow is mostly autonomous, with minimal user prompting. The user configures a NanoClaw instance and communicates with it through Slack, WhatsApp, email, terminal, or another configured channel. The agent should use the same channel to ask questions and send reports.

Core autonomous workflows:

1. Configure the autonomous agent.
   - The user configures communication integrations such as Slack, WhatsApp, or email.
   - The user configures budget limits such as maximum token spend, ideally with a daily limit.
   - The product should reuse NanoClaw's integration, scheduling, and channel model where possible.

2. Add a market.
   - The agent guides initial market creation as in manual mode.

3. Autonomous source discovery.
   - The agent periodically initiates source discovery without explicit user prompts.
   - The agent does this across all active markets and prioritizes work across markets.
   - The agent improves results over time using search history, accepted candidates, known gaps, and prior proposal decisions.
   - The agent asks the user only when it has doubts about a source; uncertainty should not block other autonomous work.

4. Autonomous crawling.
   - The agent periodically crawls accepted sources without explicit user prompts.
   - The agent does this across all active markets and prioritizes work across markets.
   - The agent improves results over time using crawl context, open frontier, stale source context, and source outcomes.

5. Autonomous extraction and review.
   - The agent periodically extracts data from stored market documents.
   - The agent does this across all active markets and prioritizes work across markets.
   - The agent auto-approves extracted candidates that meet documented policy.
   - The agent asks the user only when it has doubts about extracted intelligence; uncertainty should not block other autonomous work.

6. Autonomous reporting.
   - The agent periodically generates market reports for all active markets.
   - The agent sends reports to the user on a configured cadence, such as every few days per market.

7. Ad-hoc questions.
   - The user can explicitly prompt the agent at any time with questions about a market, company, capability, problem, source, or report.

## Product Principles

- The CLI provides context; the agent decides.
- Data is persisted in a database even if the agent dies.
- For autonomous use, reuse NanoClaw as the basis for agent execution, scheduling, channels, and integrations.
- For user workflow integrations such as Slack, WhatsApp, and email, reuse NanoClaw integrations where possible.
- The agent should auto-approve low-ambiguity work and ask the user only on doubts.
- Doubt should be explicit and auditable, not hidden in prose.
- Accepted market intelligence comes from reviewed/accepted candidates, not from live URLs or unsupported inference.
- Market maps are continuously improvable and should not claim complete coverage.

## Core Data Flow

The current product should use accepted `market_candidates` as the source of truth for market intelligence.

```text
market setup
  -> source discovery
  -> market_source_proposals
  -> accepted market_sources
  -> market_runs
  -> market_documents
  -> extracted market_candidates
  -> reviewed/accepted market_candidates
  -> computed overview/report
  -> improvement loop
```

Do not add separate durable market facts or market-map tables yet. Compute market maps and reports from accepted candidates until real workflow pain appears around duplicate accepted candidates, canonical naming, relationship editing, recategorization history, or stable report generation.

## Review, Auto-Approval, And Doubt

The product should separate proposed, accepted, and rejected intelligence.

The agent should auto-approve only when the item is low ambiguity. Examples:

- source proposal is clearly official, in-scope, non-duplicate, and has an explicit source type.
- candidate has valid evidence, medium/high confidence, matching quotes, no medium/high audit findings, no stale/conflicting/unknown uncertainty, and clear market relevance.

The agent should ask the user when it has doubts. Examples:

- source relevance is ambiguous.
- source is third-party, private, duplicated, low-trust, or adjacent to the market boundary.
- candidate has low confidence, weak evidence, stale evidence, conflicting evidence, missing quotes, quote mismatches, generic naming, duplicate identity, or unclear market fit.
- boundary or category choices require product-strategy judgment.

Review questions should not block unrelated autonomous work. The agent should continue other markets or tasks while waiting for user input.

## Evidence And Source Model

`market_sources` are research surfaces the agent is allowed to inspect. They may be websites, docs roots, RSS feeds, Slack connectors, exact URLs, or manual sources.

`market_documents` are individual retrieved evidence artifacts. Store one document per content unit:

- website/docs crawl: one page per document
- blog/RSS: one article or feed entry per document
- Slack: one message or thread per document
- exact URL: one fetched page/report/PDF per document
- manual: one user-provided artifact per document

Extraction and categorization should operate on stored `market_documents`, not directly on live URLs.

Source trust and provenance must remain visible. Official vendor websites/docs are generally higher trust than third-party commentary; private sources such as Slack need explicit privacy/access metadata.

## Reports And Ad-Hoc Answers

Reports should be generated from accepted candidates and stored evidence. V1 report formats should include JSON overview output and Markdown files written to disk.

Reports should cover:

- market definition
- category map
- companies and products
- problems and capabilities
- claims
- weak, stale, conflicting, or unknown areas
- evidence appendix

Ad-hoc answers should use the same durable state. The agent should answer from accepted candidates and stored documents, cite evidence where possible, and state when evidence is missing or insufficient.

## Current V1 Non-Goals

- No web dashboard.
- No internal LLM extraction engine unless the agent-driven workflow becomes too repetitive or painful.
- No CLI command that tries to plan the next market-improvement action; the CLI should expose context and the agent should decide.
- No fully autonomous hidden recategorization without review/auto-approval policy.
- No unsupported guesses in accepted output.
- No hard-coded AI Security assumptions.
