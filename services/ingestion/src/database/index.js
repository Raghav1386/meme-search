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

export async function closeDatabasePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}
