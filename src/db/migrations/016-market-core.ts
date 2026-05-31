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
        source_type TEXT NOT NULL CHECK (source_type IN ('url', 'rss', 'search', 'slack', 'other')),
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
        kind         TEXT NOT NULL CHECK (kind IN ('setup', 'scan', 'brief')),
        status       TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
        started_at   TEXT NOT NULL,
        completed_at TEXT,
        summary      TEXT,
        FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_market_runs_market_started ON market_runs(market_id, started_at DESC);
    `);
  },
};
