# Agent Operating Notes

This repo is a market strategy agent fork based on NanoClaw. Treat this file as the working guide for any coding assistant or automation agent working in this repository. Keep it short and update it as workflows become real.

## Default Stance

- If the user asks to use the product, operate the existing CLI instead of editing source code.
- If the user asks to change behavior, add tests first, then implementation.
- Prefer `rg` for searching and inspect existing patterns before changing code.
- Do not commit or push unless the user explicitly asks.
- Do not modify upstream remotes. Push only to this fork's `origin` when asked.

## Running Checks

- Focused tests: `pnpm exec vitest run <test files>`
- Typecheck: `pnpm run typecheck`
- Full test suite: `pnpm test`
- The full suite may need to run outside sandbox because subprocess-based tests can fail under restricted IPC.

## Market CLI Workflow

The market workflow is exposed through `ncl`, backed by the host process over `data/ncl.sock`.

Start the host if it is not already running:

```bash
pnpm run dev
```

Use a second shell for CLI calls:

```bash
pnpm ncl <resource> <verb> [target] [--key value ...] --json
```

Use `--json` for agent-driven operation so responses are parseable.

## Adding A New Market

If the user says "add a new market", interpret it as product operation, not code implementation.

If missing, ask for:

- market name
- short description
- inclusions
- exclusions
- adjacent markets
- seed source URLs

Then run:

```bash
pnpm ncl markets create --name "<NAME>" --description "<DESCRIPTION>" --json
```

Use the returned `market.id` for follow-up calls.

If boundary details were provided:

```bash
pnpm ncl market-boundaries update \
  --market-id <MARKET_ID> \
  --inclusions "<INCLUSIONS>" \
  --exclusions "<EXCLUSIONS>" \
  --adjacent-markets "<ADJACENT_MARKETS>" \
  --json
```

For each seed source URL:

```bash
pnpm ncl market-sources add \
  --market-id <MARKET_ID> \
  --url "<URL>" \
  --source-type url \
  --trust-tier trusted \
  --json
```

Verify the final state:

```bash
pnpm ncl markets get <MARKET_ID> --json
```

Report the market id, boundary status, and number of sources added.

## Current Market Capability

Implemented:

- market creation/list/get
- market boundary upsert
- market source add/list
- market run audit rows in DB helpers

Not implemented yet:

- source fetching
- document storage
- evidence extraction
- companies/products/categories
- review workflow
- market reports
