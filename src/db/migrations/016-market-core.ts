import type Database from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration016: Migration = {
  version: 16,
  name: 'market-core',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE markets (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE,
        description TEXT,
        status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      CREATE TABLE market_boundaries (
        market_id        TEXT PRIMARY KEY,
        inclusions       TEXT,
        exclusions       TEXT,
        adjacent_markets TEXT,
        notes            TEXT,
        updated_at       TEXT NOT NULL,
        FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
      );

      CREATE TABLE market_sources (
        id          TEXT PRIMARY KEY,
        market_id   TEXT NOT NULL,
        url         TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('website', 'docs', 'blog', 'rss', 'search_query', 'slack', 'exact_url', 'manual')),
        trust_tier  TEXT NOT NULL CHECK (trust_tier IN ('official', 'trusted', 'third_party', 'search', 'private')),
        status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
        notes       TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_market_sources_market_id ON market_sources(market_id);
      CREATE UNIQUE INDEX idx_market_sources_market_url ON market_sources(market_id, url);

      CREATE TABLE market_runs (
        id           TEXT PRIMARY KEY,
        market_id    TEXT NOT NULL,
        source_id    TEXT,
        kind         TEXT NOT NULL CHECK (kind IN ('setup', 'collection', 'extraction', 'brief')),
        status       TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
        started_at   TEXT NOT NULL,
        completed_at TEXT,
        summary      TEXT,
        FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
        FOREIGN KEY (source_id) REFERENCES market_sources(id) ON DELETE SET NULL
      );

      CREATE INDEX idx_market_runs_market_started ON market_runs(market_id, started_at DESC);

      CREATE TABLE market_documents (
        id            TEXT PRIMARY KEY,
        market_id     TEXT NOT NULL,
        source_id     TEXT NOT NULL,
        run_id        TEXT,
        url           TEXT NOT NULL,
        canonical_url TEXT,
        title         TEXT,
        content_text  TEXT NOT NULL,
        content_hash  TEXT,
        status        TEXT NOT NULL CHECK (status IN ('fetched', 'failed', 'skipped')),
        error         TEXT,
        fetched_at    TEXT NOT NULL,
        created_at    TEXT NOT NULL,
        metadata_json TEXT,
        FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
        FOREIGN KEY (source_id) REFERENCES market_sources(id) ON DELETE CASCADE,
        FOREIGN KEY (run_id) REFERENCES market_runs(id) ON DELETE SET NULL
      );

      CREATE INDEX idx_market_documents_market_created ON market_documents(market_id, created_at DESC);
      CREATE INDEX idx_market_documents_source ON market_documents(source_id, created_at DESC);
      CREATE INDEX idx_market_documents_run ON market_documents(run_id);

      CREATE TABLE market_candidates (
        id              TEXT PRIMARY KEY,
        market_id       TEXT NOT NULL,
        run_id          TEXT,
        candidate_type  TEXT NOT NULL CHECK (candidate_type IN ('company', 'product', 'problem', 'capability', 'category', 'claim')),
        name            TEXT NOT NULL,
        summary         TEXT,
        confidence      TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
        status          TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected')),
        evidence_json   TEXT NOT NULL,
        metadata_json   TEXT,
        review_note     TEXT,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        reviewed_at     TEXT,
        FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
        FOREIGN KEY (run_id) REFERENCES market_runs(id) ON DELETE SET NULL
      );

      CREATE INDEX idx_market_candidates_market_created ON market_candidates(market_id, created_at DESC);
      CREATE INDEX idx_market_candidates_run ON market_candidates(run_id);
      CREATE INDEX idx_market_candidates_status ON market_candidates(market_id, status, created_at DESC);
    `);
  },
};
