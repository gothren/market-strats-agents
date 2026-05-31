import type Database from 'better-sqlite3';
import type { Migration } from './index.js';

function tableSql(db: Database.Database, name: string): string {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) as
    | { sql: string }
    | undefined;
  return row?.sql ?? '';
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(
    (row) => row.name === column,
  );
}

export const migration017: Migration = {
  version: 17,
  name: 'market-documents',
  up(db: Database.Database) {
    const sourceSql = tableSql(db, 'market_sources');
    if (sourceSql.includes("'url'")) {
      db.exec(`
        CREATE TABLE market_sources_new (
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

        INSERT INTO market_sources_new
          (id, market_id, url, source_type, trust_tier, status, notes, created_at, updated_at)
        SELECT
          id,
          market_id,
          url,
          CASE
            WHEN source_type = 'url' THEN 'exact_url'
            WHEN source_type = 'search' THEN 'search_query'
            WHEN source_type IN ('rss', 'slack') THEN source_type
            ELSE 'manual'
          END,
          trust_tier,
          status,
          notes,
          created_at,
          updated_at
        FROM market_sources;

        DROP TABLE market_sources;
        ALTER TABLE market_sources_new RENAME TO market_sources;

        CREATE INDEX IF NOT EXISTS idx_market_sources_market_id ON market_sources(market_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_market_sources_market_url ON market_sources(market_id, url);
      `);
    }

    if (!hasColumn(db, 'market_runs', 'source_id') || tableSql(db, 'market_runs').includes("'scan'")) {
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
          NULL,
          CASE WHEN kind = 'scan' THEN 'collection' ELSE kind END,
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
      CREATE TABLE IF NOT EXISTS market_documents (
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

      CREATE INDEX IF NOT EXISTS idx_market_documents_market_created ON market_documents(market_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_market_documents_source ON market_documents(source_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_market_documents_run ON market_documents(run_id);
    `);
  },
};
