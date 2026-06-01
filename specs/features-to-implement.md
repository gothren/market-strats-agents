# Features To Implement

This is a working backlog for the market strategy agent. Keep items concise and update them as implementation decisions become real.

## Smarter Fetching

Status: Implemented for `exact_url` sources.

Current collection stores a new `market_document` every time an `exact_url` source is fetched, even if the URL and content have not changed.

Implement smarter fetch behavior:

- Detect unchanged documents using `source_id`, canonical URL, and `content_hash`.
- Do not create duplicate `market_documents` when fetched content is unchanged.
- Record unchanged counts in the collection run summary.
- Keep collection runs auditable even when no new documents are stored.
- Report collection results with counts for:
  - visited sources
  - stored documents
  - unchanged documents
  - failed documents
  - unsupported source types
- Preserve explicit failures as failed document records or equivalent auditable run output.

Recommended v1 behavior:

- If the same source produces the same canonical URL and same content hash, skip storing a duplicate document.
- Put the unchanged observation in the `market_run.summary`.
- Defer a separate `market_document_observations` table until we need full per-run observation history.
- Known v1 tradeoff: `--failed-only` still relies on document rows. If a failed source later fetches unchanged content matching an older fetched document, no new fetched row is created. Revisit this only if it becomes real workflow pain.

## OpenAI Help Center Fetch Support

Fix collection for OpenAI Help Center sources such as `https://help.openai.com/en/articles/20001107`.

Context:

- The Code Security market source still fails with `HTTP 403 Forbidden`.
- Latest observed run: `mrun_1780342497230_swkog4` for market `mkt_1780237906831_iqsl27`.
- Mend.io now fetches successfully after adding browser-like request headers, so this is a narrower remaining fetch compatibility gap.

Implementation goals:

- Fetch OpenAI Help Center article pages reliably enough for market evidence collection.
- Keep source fetching auditable: if a fetch is blocked, preserve the failure status and error details.
- Prefer a general fetcher improvement if the same approach applies to Intercom-style help centers, but keep the first test case anchored on the OpenAI URL above.
- Add focused coverage proving the OpenAI Help Center URL no longer records `HTTP 403 Forbidden` when the compatibility path succeeds.

## Extraction From Stored Evidence

Implement extraction after documents are fetched:

- Read from stored `market_documents`, not live URLs.
- Create reviewable typed candidates for companies, products, problems, capabilities, categories, and claims.
- Require every candidate to link back to one or more document ids.
- Store candidates as proposed by default.
- Add review states for proposed, accepted, and rejected.
- Prefer a batch JSON import command for agent-driven workflows.

## Future Fetch Sources

Expand collection beyond `exact_url`:

- bounded docs crawl
- bounded website crawl
- blog crawl
- RSS connector
- search query connector
- Slack connector
- manual evidence import

Each source type should remain bounded, auditable, and explicit about skipped or unsupported content.
