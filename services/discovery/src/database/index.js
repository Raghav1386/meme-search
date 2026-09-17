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
        last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(platform, platform_content_id)
      );
    `);

    // Add last_seen_at if it doesn't exist (for migration of existing tables)
    await db.query(`
      ALTER TABLE discovery_candidates ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `).catch(() => {});
    
    // Add sha256_hash for duplicate detection
    await db.query(`
      ALTER TABLE discovery_candidates ADD COLUMN IF NOT EXISTS sha256_hash VARCHAR(64);
    `).catch((err) => { logger.warn('Failed to add sha256_hash column', { error: err.message }); });
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS discovery_candidates_sha256_hash_idx ON discovery_candidates(sha256_hash);
    `).catch((err) => { logger.warn('Failed to add sha256_hash index', { error: err.message }); });
    
    // Safely deduplicate before adding unique constraint
    await db.query(`
      DELETE FROM discovery_candidates a USING discovery_candidates b
      WHERE a.id < b.id AND a.sha256_hash = b.sha256_hash AND a.sha256_hash IS NOT NULL;
    `).catch((err) => { logger.warn('Failed to deduplicate sha256_hash', { error: err.message }); });

    // Add unique constraint
    await db.query(`
      ALTER TABLE discovery_candidates ADD CONSTRAINT unique_sha256_hash UNIQUE(sha256_hash);
    `).catch((err) => { logger.warn('Failed to add unique_sha256_hash constraint', { error: err.message }); });

    // Add phash (no unique constraint per Phase 3.4C)
    await db.query(`
      ALTER TABLE discovery_candidates ADD COLUMN IF NOT EXISTS phash VARCHAR(16);
    `).catch((err) => { logger.warn('Failed to add phash column', { error: err.message }); });

    // Wipe legacy dHash values to enforce DCT regeneration
    await db.query(`
      UPDATE discovery_candidates SET phash = NULL WHERE phash IS NOT NULL;
    `).catch((err) => { logger.warn('Failed to wipe legacy dHash values', { error: err.message }); });

    // Phase 2B: Topic Discovery Tables
    await db.query(`
      CREATE TABLE IF NOT EXISTS discovery_topics (
        topic VARCHAR(255) PRIMARY KEY,
        first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        observation_count INT DEFAULT 0,
        previous_frequency FLOAT DEFAULT 0.0,
        current_frequency FLOAT DEFAULT 0.0,
        frequency_change FLOAT DEFAULT 0.0,
        average_upvotes FLOAT DEFAULT 0.0,
        average_comments FLOAT DEFAULT 0.0,
        communities_seen JSONB DEFAULT '[]'::jsonb
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS discovery_queries (
        query VARCHAR(255) PRIMARY KEY,
        last_used_at TIMESTAMP,
        use_count INT DEFAULT 0,
        total_candidates_returned INT DEFAULT 0,
        total_candidates_accepted INT DEFAULT 0,
        total_candidates_rejected INT DEFAULT 0
      );
    `);

    logger.info('Discovery database tables initialized');
  } catch (err) {
    logger.error('Failed to initialize discovery database tables', { error: err.message });
    throw err;
  }
}

export async function checkDatabaseHealth() {
  const db = getDatabasePool();
  if (!db) return 'disabled';
  try {
    await db.query('SELECT 1');
    return 'connected';
  } catch (err) {
    logger.error('Database health check failed', { error: err.message });
    return 'disconnected';
  }
}

export async function closeDatabase() {
  if (pool) {
    try {
      await pool.end();
      logger.info('PostgreSQL connection pool closed');
    } catch (err) {
      logger.error('Error closing PostgreSQL connection pool', { error: err.message });
    }
    pool = null;
  }
}
