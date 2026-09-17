import pkg from 'pg';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const { Pool } = pkg;

let ingestionPool = null;

export function getDatabasePool() {
  if (!ingestionPool) {
    if (!config.INGESTION_DATABASE_URL) {
      throw new Error('CRITICAL: INGESTION_DATABASE_URL is not set. Service cannot start.');
    }
    ingestionPool = new Pool({
      connectionString: config.INGESTION_DATABASE_URL,
      ssl: config.INGESTION_DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
    });
  }
  return ingestionPool;
}

export async function closeDatabasePool() {
  if (ingestionPool) {
    await ingestionPool.end();
    ingestionPool = null;
    logger.info('Ingestion database pool closed');
  }
}
