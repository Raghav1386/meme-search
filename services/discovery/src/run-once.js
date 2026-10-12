import dotenv from 'dotenv';
dotenv.config();

import config, { validateConfig } from './config/index.js';
import logger from './utils/logger.js';
import { getRedisClient, closeRedisConnection } from './config/redis.js';
import { initQueue, closeQueue } from './queue/producer.js';
import { runDiscovery } from './core/discovery.js';
import { initDiscoveryDatabase, closeDatabase } from './database/index.js';

async function bootstrap() {
  let exitCode = 0;
  try {
    validateConfig();
    logger.info('Starting single-run Discovery & Queuing pipeline');

    // Ensure queueing is enabled for run-once by default (single command for discovery + queue)
    config.DISCOVERY_SKIP_QUEUE = process.env.DISCOVERY_SKIP_QUEUE === 'true';

    console.log('=== Meme Discovery & Ingestion Run ===');
    console.log(`Subreddits: ${config.DISCOVERY_SUBREDDITS?.join(', ')}`);
    console.log(`Collection Limit: ${config.DISCOVERY_REDDIT_COLLECTION_LIMIT}`);
    console.log(`Queue Active: ${!config.DISCOVERY_SKIP_QUEUE}`);

    getRedisClient();
    await initDiscoveryDatabase();
    initQueue();

    // Run the full discovery pipeline
    const runId = `discovery-run-${Date.now()}`;
    const results = await runDiscovery(runId);

    console.log('\n=== RUN COMPLETED ===');
    console.log(`Run ID: ${results?.discovery_run_id || runId}`);
    console.log(`Received: ${results?.candidates_received || 0}`);
    console.log(`Duplicates: ${results?.candidates_duplicates || 0}`);
    console.log(`Accepted: ${results?.candidates_accepted || 0}`);
    console.log(`Queued to Ingestion: ${results?.candidates_queued || 0}`);
    console.log(`Queue Failed: ${results?.candidates_queue_failed || 0}`);
    console.log(`Already Queued: ${results?.candidates_already_queued || 0}`);

    if (results?.candidates_queue_failed > 0) {
      logger.warn(`Some candidates failed to queue: ${results.candidates_queue_failed}`);
    }

    logger.info('Discovery & Queuing run completed successfully.');
  } catch (error) {
    logger.error(`Discovery run failed: ${error.message}`);
    console.error('Fatal run error:', error);
    exitCode = 1;
  } finally {
    // Graceful cleanup of resources
    await closeQueue();
    await closeRedisConnection();
    await closeDatabase();
    process.exit(exitCode);
  }
}

bootstrap();
