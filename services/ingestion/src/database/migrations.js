import { getDatabasePool } from './index.js';
import config from '../config/index.js';
import url from 'url';

export async function runMigrations() {
  const db = getDatabasePool();
  if (!db) {
    console.error('[Migration] Skipping migrations: Database connection not available.');
    process.exitCode = 1;
    return;
  }

  try {
    const dbHost = new url.URL(config.INGESTION_DATABASE_URL).hostname;
    const dbName = new url.URL(config.INGESTION_DATABASE_URL).pathname.replace('/', '');
    console.log('[Migration] Starting Ingestion database migration');
    console.log(`[Migration] Target database host: ${dbHost}`);
    console.log(`[Migration] Target database name: ${dbName}`);
    console.log('[Migration] Connecting...');

    // We can just run a quick test query to ensure connection is actually established
    await db.query('SELECT 1 AS check');

    console.log('[Migration] Connected');
    console.log('[Migration] Creating required tables...');
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS ingestion_media (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          sha256_hash VARCHAR(64) UNIQUE,
          phash VARCHAR(64),
          
          b2_key VARCHAR(500) UNIQUE,
          format VARCHAR(20),
          width INT,
          height INT,
          file_size INT,
          
          ocr_status VARCHAR(50) DEFAULT 'PENDING',
          ocr_text TEXT,
          
          embedding_status VARCHAR(50) DEFAULT 'PENDING',
          embedding_dimension INT,
          
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ingestion_candidates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          candidate_id VARCHAR(255) NOT NULL UNIQUE,
          platform VARCHAR(50) NOT NULL,
          platform_content_id VARCHAR(255),
          source_media_url TEXT NOT NULL,
          caption TEXT,
          
          status VARCHAR(50) DEFAULT 'QUEUED',
          error_reason TEXT,
          retry_count INT DEFAULT 0,
          
          media_id UUID REFERENCES ingestion_media(id),
          
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add ingested_at column if it doesn't exist
    await db.query(`
      CREATE EXTENSION IF NOT EXISTS vector;

      ALTER TABLE ingestion_candidates 
      ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMP WITH TIME ZONE;
      
      ALTER TABLE ingestion_media 
      ADD COLUMN IF NOT EXISTS embedding vector(512);
    `);

    // Indexes for fast lookups
    await db.query(`CREATE INDEX IF NOT EXISTS ingestion_candidates_status_idx ON ingestion_candidates(status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS ingestion_media_sha256_idx ON ingestion_media(sha256_hash);`);

    console.log('[Migration] Migration completed successfully');
    process.exitCode = 0;
  } catch (err) {
    if (err.message.includes('does not exist')) {
       console.error(`\n[Migration] CRITICAL ERROR: The database does not exist.`);
       console.error(`[Migration] Neon databases cannot be safely created from an isolated SQL connection without connecting to a different existing database (which is strictly forbidden to preserve existing MemeSearch data).`);
       console.error(`[Migration] ACTION REQUIRED: Please log into your Neon console and explicitly create a database branch/database named "ingestion_db".`);
       console.error(`[Migration] Error details: ${err.message}\n`);
    } else {
       console.error(`[Migration] Error: ${err.message}`);
    }
    process.exitCode = 1;
  }
}

// Execute directly if run as a script
import { fileURLToPath } from 'url';
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runMigrations().then(() => {
    // Force exit after a delay if pool hangs, though usually we'd close the pool
    setTimeout(() => process.exit(process.exitCode), 100);
  }).catch(() => {
    process.exit(1);
  });
}
