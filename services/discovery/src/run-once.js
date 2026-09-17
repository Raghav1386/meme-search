import dotenv from 'dotenv';
dotenv.config();

import config, { validateConfig } from './config/index.js';
import logger from './utils/logger.js';
import { getRedisClient, closeRedisConnection } from './config/redis.js';
import { initQueue, closeQueue } from './queue/producer.js';
import { runDiscovery } from './core/discovery.js';
import { initDiscoveryDatabase, closeDatabase } from './database/index.js';

async function bootstrap() {
  try {
    validateConfig();
    logger.info('Starting one-off Discovery Run for GitHub Actions');

    getRedisClient();
    await initDiscoveryDatabase();
    initQueue();

    // Run the pipeline once and wait for it to finish
    await runDiscovery();

    logger.info('Discovery Run completed. Shutting down gracefully.');
  } catch (error) {
    logger.error(`Failed during run: ${error.message}`);
  } finally {
    // Cleanup
    await closeQueue();
    await closeRedisConnection();
    await closeDatabase();
    process.exit(0);
  }
}

bootstrap();
