import type Database from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration021: Migration = {
  version: 21,
  name: 'market-crawl-urls',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS market_crawl_urls (
        id                  TEXT PRIMARY KEY,
        market_id           TEXT NOT NULL,
        source_id           TEXT NOT NULL,
        run_id              TEXT NOT NULL,
        url                 TEXT NOT NULL,
        normalized_url      TEXT NOT NULL,
        reason              TEXT NOT NULL,
        depth               INTEGER,
        discovered_from_url TEXT,
        priority_score      INTEGER NOT NULL DEFAULT 0,
        status              TEXT NOT NULL,
        created_at          TEXT NOT NULL,
        updated_at          TEXT NOT NULL,
        FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
        FOREIGN KEY (source_id) REFERENCES market_sources(id) ON DELETE CASCADE,
        FOREIGN KEY (run_id) REFERENCES market_runs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_market_crawl_urls_market_status
        ON market_crawl_urls(market_id, status, reason);
      CREATE INDEX IF NOT EXISTS idx_market_crawl_urls_run
        ON market_crawl_urls(run_id, status, reason, priority_score DESC);
      CREATE INDEX IF NOT EXISTS idx_market_crawl_urls_source_status
        ON market_crawl_urls(source_id, status, reason);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_market_crawl_urls_open_unique
        ON market_crawl_urls(market_id, source_id, normalized_url)
        WHERE status = 'open';
    `);
  },
};
