import type Database from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration019: Migration = {
  version: 19,
  name: 'market-source-proposals',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS market_source_proposals (
        id                   TEXT PRIMARY KEY,
        market_id            TEXT NOT NULL,
        url                  TEXT NOT NULL,
        normalized_url       TEXT NOT NULL,
        source_type          TEXT NOT NULL CHECK (source_type IN ('website', 'docs', 'blog', 'rss', 'search_query', 'slack', 'exact_url', 'manual')),
        trust_tier           TEXT NOT NULL CHECK (trust_tier IN ('official', 'trusted', 'third_party', 'search', 'private')),
        title                TEXT,
        snippet              TEXT,
        rationale            TEXT NOT NULL,
        discovered_from      TEXT,
        search_query         TEXT,
        proposed_entity_name TEXT,
        proposed_entity_type TEXT,
        status               TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected')),
        source_id            TEXT,
        review_note          TEXT,
        metadata_json        TEXT,
        created_at           TEXT NOT NULL,
        updated_at           TEXT NOT NULL,
        reviewed_at          TEXT,
        FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
        FOREIGN KEY (source_id) REFERENCES market_sources(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_market_source_proposals_market_created
        ON market_source_proposals(market_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_market_source_proposals_status
        ON market_source_proposals(market_id, status, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_market_source_proposals_market_normalized_url
        ON market_source_proposals(market_id, normalized_url);
    `);
  },
};
