# Future Market Strategy CLI Migration

## Why This Exists

The current market strategy product is implemented inside the NanoClaw fork because that gave us fast access to an agent runtime, CLI plumbing, durable state, approvals, and future channel integrations.

That was the right choice for early product validation, but it is not the desired long-term architecture. The market strategy product should be usable by multiple agent runtimes, not only by this NanoClaw fork.

We expect to finish and test the current manual workflow epic before doing this migration. Details will change as that work lands, so this document intentionally captures only the architectural direction.

## Desired Architecture

The target architecture is:

```text
market strategy core library
  market data model
  source/document/candidate/report workflows
  crawling and search memory
  validation, review, and report support

market strategy CLI
  agent-facing commands for Claude Code, Codex, and other local agents
  thin wrapper around the core library

NanoClaw integration
  scheduling, channels, approvals, background operation, autonomous workflows
  calls the market strategy CLI or library as a tool
```

NanoClaw should be the agent runtime and orchestration layer. The market strategy subsystem should be the portable product capability.

## What We Are Trying To Achieve

- Let Claude Code, Codex, or another manual coding agent use the market strategy product directly without needing to run the full NanoClaw fork.
- Let NanoClaw use the same market strategy capability for autonomous workflows through Slack, WhatsApp, email, terminal, or other channels.
- Keep market concepts portable: markets, boundaries, sources, documents, runs, candidates, review state, search memory, crawl context, and reports.
- Avoid locking the market product into NanoClaw-specific CLI resource files, host process assumptions, or channel/runtime internals.
- Make future MCP/API/UI layers easier by wrapping the same core library instead of reimplementing market behavior.

## Migration Direction

After the current manual workflow epic is finished and tested, plan a big-bang migration that separates the market strategy product from NanoClaw internals.

At a high level, the migration should:

- Extract market domain logic out of NanoClaw CLI resource code into a market strategy core module or package.
- Keep database persistence behind a clear adapter boundary.
- Provide a standalone market strategy CLI for manual agent workflows.
- Reconnect NanoClaw to the extracted capability through a thin integration layer.
- Preserve the current durable data model unless there is a clear reason to migrate it.
- Keep existing agent workflows working through updated documentation.

## Boundaries To Preserve

- The market strategy product owns market intelligence concepts and workflows.
- NanoClaw owns agent runtime concerns: scheduling, channels, approvals, delivery, and autonomous orchestration.
- The agent remains responsible for judgment, synthesis, and workflow decisions.
- The CLI/core should provide context and durable mutations, not become an internal LLM strategist.

## Non-Goals For This Document

- Do not define the final package layout yet.
- Do not define a migration sequence yet.
- Do not choose CLI versus library versus MCP integration details yet.
- Do not add new tables or rewrite the data model just for architectural cleanliness.
- Do not start this migration until the current manual workflow epic is finished and tested.
