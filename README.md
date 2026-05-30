# Market Strategy Agents

Market Strategy Agents is a fork of [NanoClaw](https://github.com/nanocoai/nanoclaw) for building a local-first market intelligence workbench.

The goal is to help a product strategist define a market, discover relevant companies and products, map problems to solutions and capabilities, retain evidence, and track how the market changes over time.

## Current Status

This repo is in early planning and setup.

The current product and architecture specs live in [`specs/`](specs/):

- [`product-spec.md`](specs/product-spec.md)
- [`technical-implementation.md`](specs/technical-implementation.md)
- [`core-and-skills-architecture.md`](specs/core-and-skills-architecture.md)

## Base

This project keeps NanoClaw as the base runtime for now:

- container-isolated agent execution
- scheduled tasks
- local CLI support
- channel adapters
- skill-based customization

The first implementation target is a terminal-first market intelligence workflow. Messaging interfaces such as Slack or WhatsApp are future-facing and should reuse NanoClaw's channel model where practical.

## Development

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Run checks:

```bash
pnpm run typecheck
pnpm test
```

## Upstream

This fork tracks NanoClaw upstream so we can keep the base harness current while adding market-strategy-specific capabilities.
