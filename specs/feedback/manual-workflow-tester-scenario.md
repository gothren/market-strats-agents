# Manual Workflow Tester Scenario

Use this scenario to test whether a separate coding assistant can operate the market strategy product as a product-strategy agent, without being spoon-fed CLI commands.

## Tester Prompt

Start a fresh agent session in this repo and say only:

```text
Let's add a new market: Automated Pen Testing.
```

Then interact naturally as a product strategist. Do not tell the agent which CLI commands to run. Let the agent ask for missing setup details, propose next actions, and drive the workflow.

## What To Test

The agent should be able to progress through the manual workflow from normal user language:

- set up or find the market
- ask for missing boundary details only when needed
- search for official company/product evidence
- decide which findings are ready to research and which need user judgment
- gather evidence through a serious crawl session
- identify companies, products, buyer problems, capabilities, categories, and claims from stored evidence
- auto-accept low-ambiguity intelligence and present doubtful cases as `core`, `adjacent`, `exclude`, or `needs more evidence`
- generate a market map or Markdown report
- answer an ad-hoc question from stored evidence

Useful natural follow-up prompts include:

- `Yes, continue.`
- `Find more companies.`
- `Gather evidence from these.`
- `What did you find?`
- `Which companies are boundary cases?`
- `Make me a market report.`
- `What are the biggest gaps?`
- `Tell me what capabilities recur across vendors.`

## Success Criteria

The workflow is working if:

- the user does not need to know command names
- the agent proposes sensible next actions after each step
- default summaries use market-research language: companies, products, buyer problems, capabilities, categories, boundary cases, confidence, and gaps
- internal terms such as candidates, proposals, run ids, audit findings, JSON payloads, and command names are hidden unless useful for traceability or requested
- the agent asks for user judgment only on real ambiguity
- obvious official company/product evidence is handled without unnecessary user interruption
- adjacent or boundary vendors are not silently accepted as core market participants
- the final report or map is useful to a product strategist

## Report Back

After testing, write feedback under `specs/feedback/` with:

- the starting prompt and market tested
- where the agent got stuck or asked for too much guidance
- places where it exposed internal implementation language
- examples of good or bad auto-approval decisions
- boundary cases it handled well or poorly
- gaps in `AGENTS.md` that would help the next agent
- whether the manual workflow felt like market research rather than operating a database
