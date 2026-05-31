import type Database from 'better-sqlite3';
import type { Migration } from './index.js';

function tableSql(db: Database.Database, name: string): string {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) as
    | { sql: string }
    | undefined;
  return row?.sql ?? '';
}

export const migration018: Migration = {
  version: 18,
  name: 'market-candidates',
  up(db: Database.Database) {
    if (tableSql(db, 'market_runs') && !tableSql(db, 'market_runs').includes("'extraction'")) {
      db.exec(`
        CREATE TABLE market_runs_new (
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

        INSERT INTO market_runs_new
          (id, market_id, source_id, kind, status, started_at, completed_at, summary)
        SELECT
          id,
          market_id,
          source_id,
          kind,
          status,
          started_at,
          completed_at,
          summary
        FROM market_runs;

        DROP TABLE market_runs;
        ALTER TABLE market_runs_new RENAME TO market_runs;

        CREATE INDEX IF NOT EXISTS idx_market_runs_market_started ON market_runs(market_id, started_at DESC);
      `);
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS market_candidates (
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

      CREATE INDEX IF NOT EXISTS idx_market_candidates_market_created ON market_candidates(market_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_market_candidates_run ON market_candidates(run_id);
      CREATE INDEX IF NOT EXISTS idx_market_candidates_status ON market_candidates(market_id, status, created_at DESC);
    `);
  },
};
