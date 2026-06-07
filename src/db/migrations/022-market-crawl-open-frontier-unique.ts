import type Database from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration022: Migration = {
  version: 22,
  name: 'market-crawl-open-frontier-unique',
  up(db: Database.Database) {
    db.exec(`
      UPDATE market_crawl_urls
      SET status = 'superseded',
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE status = 'open'
        AND id NOT IN (
          SELECT id
          FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                     PARTITION BY market_id, source_id, normalized_url
                     ORDER BY priority_score DESC, created_at ASC, id ASC
                   ) AS rn
            FROM market_crawl_urls
            WHERE status = 'open'
          )
          WHERE rn = 1
        );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_market_crawl_urls_open_unique
        ON market_crawl_urls(market_id, source_id, normalized_url)
        WHERE status = 'open';
    `);
  },
};
