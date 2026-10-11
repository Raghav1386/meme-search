import dotenv from 'dotenv';
dotenv.config();

import Redis from 'ioredis';
import { Queue } from 'bullmq';
import config, { validateConfig } from './config/index.js';
import logger from './utils/logger.js';
import { getRedisClient, closeRedisConnection } from './config/redis.js';
import { closeDatabasePool } from './database/index.js';
import { runMigrations } from './database/migrations.js';
import { initWorker, closeWorker } from './queue/worker.js';

const BATCH_TIMEOUT_MS = parseInt(process.env.INGESTION_BATCH_TIMEOUT_MS || '1200000', 10); // 20 minutes max runtime
const IDLE_SETTLE_MS = 5000; // 5s idle settling window
const POLL_INTERVAL_MS = 2000; // Poll queue counts every 2s
const MAX_DELAYED_WAIT_MS = 30000; // 30s max wait for transient retry backoff

let isShuttingDown = false;
let queueConnection = null;
let queue = null;

async function cleanupResources() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('Cleaning up worker and service connections...');

  try {
    await closeWorker();
  } catch (err) {
    logger.error(`Error closing BullMQ worker: ${err.message}`);
  }

  try {
    if (queue) await queue.close();
    if (queueConnection) await queueConnection.quit();
  } catch (err) {
    logger.error(`Error closing BullMQ queue connection: ${err.message}`);
  }

  try {
    await closeDatabasePool();
  } catch (err) {
    logger.error(`Error closing database pool: ${err.message}`);
  }

  try {
    await closeRedisConnection();
  } catch (err) {
    logger.error(`Error closing worker Redis connection: ${err.message}`);
  }

  logger.info('All resources successfully closed.');
}

async function handleSignal(signal) {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);
  await cleanupResources();
  process.exit(0);
}

process.on('SIGTERM', () => handleSignal('SIGTERM'));
process.on('SIGINT', () => handleSignal('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  cleanupResources().then(() => process.exit(1));
});

async function runBatch() {
  const startTime = Date.now();
  let exitCode = 0;

  try {
    // 1. Validate isolated ingestion configuration
    validateConfig();
    logger.info('Starting bounded single-run Ingestion worker');

    const queueName = config.INGESTION_QUEUE_NAME || 'meme-ingestion';
    logger.info(`Target Queue: ${queueName}`);

    // 2. Dedicated Redis connection for BullMQ Queue metrics inspection
    queueConnection = new Redis(config.REDIS_URL, {
      family: 0,
      maxRetriesPerRequest: null,
    });
    queue = new Queue(queueName, { connection: queueConnection });

    // 3. Pre-flight check: Do not run ingestion if queue has no work
    const initialCounts = await queue.getJobCounts('wait', 'active', 'delayed');
    const waitingCount = initialCounts.wait || 0;
    const activeCount = initialCounts.active || 0;
    const delayedCount = initialCounts.delayed || 0;

    logger.info(`Initial queue counts: ${waitingCount} waiting, ${activeCount} active, ${delayedCount} delayed`);

    if (waitingCount === 0 && activeCount === 0 && delayedCount === 0) {
      logger.info('Queue has no pending work (waiting: 0, active: 0, delayed: 0). Exiting immediately.');
      console.log('\n=== INGESTION RUN SKIPPED: QUEUE EMPTY ===');
      await cleanupResources();
      process.exit(0);
    }

    // 4. Run database migrations to ensure required schema & pgvector tables exist
    logger.info('Executing database migrations...');
    await runMigrations();

    // 5. Initialize the BullMQ Worker (reusing existing worker implementation)
    const worker = initWorker();

    let completedJobs = 0;
    let failedJobs = 0;

    worker.on('completed', (job) => {
      completedJobs++;
      logger.info(`Job completed: ${job.id} (Candidate: ${job.data?.candidate_id}) [Completed: ${completedJobs}]`);
    });

    worker.on('failed', (job, err) => {
      failedJobs++;
      logger.warn(`Job failed: ${job?.id} (Candidate: ${job?.data?.candidate_id}): ${err.message} [Failed: ${failedJobs}]`);
    });

    console.log('\n=== INGESTION RUN STARTED ===');
    console.log(`Queue: ${queueName}`);
    console.log(`Concurrency: ${config.INGESTION_WORKER_CONCURRENCY || 1}`);
    console.log(`Initial Pending: ${waitingCount + activeCount + delayedCount}`);

    // 6. Monitor until queue is drained or timeout is reached
    let idleStartTime = null;
    let delayedStartTime = null;

    while (true) {
      if (Date.now() - startTime >= BATCH_TIMEOUT_MS) {
        logger.warn(`Batch execution reached timeout of ${BATCH_TIMEOUT_MS / 1000}s. Stopping worker.`);
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const counts = await queue.getJobCounts('wait', 'active', 'delayed');
      const curWait = counts.wait || 0;
      const curActive = counts.active || 0;
      const curDelayed = counts.delayed || 0;

      // When there are no waiting and no active jobs
      if (curWait === 0 && curActive === 0) {
        if (curDelayed === 0) {
          if (!idleStartTime) {
            idleStartTime = Date.now();
            logger.info('No waiting or active jobs detected. Waiting for idle settle window...');
          } else if (Date.now() - idleStartTime >= IDLE_SETTLE_MS) {
            logger.info('Queue fully drained and verified idle.');
            break;
          }
        } else {
          // Delayed jobs exist (e.g. backoff retry)
          if (!delayedStartTime) delayedStartTime = Date.now();
          if (Date.now() - delayedStartTime >= MAX_DELAYED_WAIT_MS) {
            logger.info(`Delayed jobs still waiting after ${MAX_DELAYED_WAIT_MS / 1000}s. Releasing batch for next run.`);
            break;
          }
        }
      } else {
        // Reset idle timers if new jobs become active/waiting
        idleStartTime = null;
        delayedStartTime = null;
      }
    }

    console.log('\n=== INGESTION RUN COMPLETED ===');
    console.log(`Total Completed: ${completedJobs}`);
    console.log(`Total Failed: ${failedJobs}`);
    console.log(`Duration: ${Math.round((Date.now() - startTime) / 1000)}s`);

  } catch (error) {
    logger.error(`Ingestion batch run failed: ${error.message}`);
    console.error('Fatal batch run error:', error);
    exitCode = 1;
  } finally {
    await cleanupResources();
    process.exit(exitCode);
  }
}

runBatch();
