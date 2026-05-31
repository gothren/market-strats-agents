# Features To Implement

This is a working backlog for the market strategy agent. Keep items concise and update them as implementation decisions become real.

## Smarter Fetching

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
