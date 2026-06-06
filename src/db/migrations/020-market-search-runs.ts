import type Database from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration020: Migration = {
  version: 20,
  name: 'market-search-runs',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS market_search_runs (
        id           TEXT PRIMARY KEY,
        market_id    TEXT NOT NULL,
        query        TEXT NOT NULL,
        intent       TEXT NOT NULL,
        rationale    TEXT,
        results_json TEXT NOT NULL,
        notes        TEXT,
        searched_at  TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_market_search_runs_market_searched
        ON market_search_runs(market_id, searched_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_market_search_runs_market_query
        ON market_search_runs(market_id, query);
    `);
  },
};
