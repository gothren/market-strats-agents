# Features To Implement

This is the active implementation backlog for the market strategy agent. Remove items once implemented and move durable behavior notes to `technical-implementation.md` or `product-spec.md`.

Use this format so coding agents can pick up work without a long planning thread:

- `Goal`: the user-visible capability.
- `Context`: why it matters or what was observed.
- `Implementation notes`: constraints, preferred direction, and known decisions.
- `Acceptance`: what must be true before the item can be removed.

## OpenAI Help Center Fetch Support

Goal:

- Fetch OpenAI Help Center article pages reliably enough for market evidence collection.

Context:

- The Code Security market source `https://help.openai.com/en/articles/20001107` still fails with `HTTP 403 Forbidden`.
- Latest observed run: `mrun_1780342497230_swkog4` for market `mkt_1780237906831_iqsl27`.
- Mend.io now fetches successfully after adding browser-like request headers, so this is a narrower remaining fetch compatibility gap.

Implementation notes:

- Keep source fetching auditable: if a fetch is blocked, preserve the failure status and error details.
- Prefer a general fetcher improvement if the same approach applies to Intercom-style help centers, but keep the first test case anchored on the OpenAI URL above.

Acceptance:

- Add focused coverage proving the OpenAI Help Center URL no longer records `HTTP 403 Forbidden` when the compatibility path succeeds.
- Manual or fixture-backed collection result stores a fetched document for the OpenAI Help Center article.

## Extraction From Stored Evidence

Goal:

- Extract reviewable market candidates from stored evidence documents.

Context:

- The current workflow supports manual/agent-driven candidate import, but the product needs an extraction path from stored `market_documents`.
- Extraction must not use live URLs directly because recategorization should be possible from retained evidence.

Implementation notes:

- Read from stored `market_documents`, not live URLs.
- Create reviewable typed candidates for companies, products, problems, capabilities, categories, and claims.
- Require every candidate to link back to one or more document ids.
- Store candidates as proposed by default.
- Add review states for proposed, accepted, and rejected.
- Prefer a batch JSON import command for agent-driven workflows.

Acceptance:

- A command or agent workflow can extract candidates from existing fetched documents.
- Extracted candidates include evidence references to document ids.
- Candidates are proposed by default and can be reviewed with existing review commands.

## Future Fetch Sources

Goal:

- Expand collection beyond `exact_url`.

Context:

- `market_sources` represent research surfaces, not only deterministic URL artifacts.
- Unsupported source types currently return explicit unsupported responses.

Implementation notes:

- bounded docs crawl
- bounded website crawl
- blog crawl
- RSS connector
- search query connector
- Slack connector
- manual evidence import

Each source type should remain bounded, auditable, and explicit about skipped or unsupported content.

Acceptance:

- Each newly supported source type stores one `market_document` per content unit.
- Collection runs report visited, stored, unchanged, skipped, failed, and unsupported counts where applicable.
- Unsupported or skipped content includes a clear reason.
