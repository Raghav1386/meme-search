import pkg from 'pg';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const { Pool } = pkg;

let pool = null;

export function getDatabasePool() {
  if (!pool) {
    if (!config.DISCOVERY_DATABASE_URL) {
      logger.warn('DISCOVERY_DATABASE_URL is not set. Database integration disabled.');
      return null;
    }
    pool = new Pool({
      connectionString: config.DISCOVERY_DATABASE_URL,
      ssl: config.DISCOVERY_DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
    });
  }
  return pool;
}

export async function initDiscoveryDatabase() {
  const db = getDatabasePool();
  if (!db) return;

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS discovery_runs (
        id VARCHAR(255) PRIMARY KEY,
        status VARCHAR(50) NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        metrics_json JSONB
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS discovery_candidates (
        id VARCHAR(255) PRIMARY KEY,
        run_id VARCHAR(255) REFERENCES discovery_runs(id),
        platform VARCHAR(50) NOT NULL,
        platform_content_id VARCHAR(255) NOT NULL,
        metadata_json JSONB,
        trend_score FLOAT,
        status VARCHAR(50) NOT NULL,
        embedding_status VARCHAR(50) DEFAULT 'pending',
        media_url VARCHAR(1024),
        error_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(platform, platform_content_id)
      );
    `);
    
    logger.info('Discovery database tables initialized');
  } catch (err) {
    logger.error('Failed to initialize discovery database tables', { error: err.message });
  }
}
