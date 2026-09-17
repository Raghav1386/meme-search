import express from 'express';
import config, { validateConfig } from './config/index.js';
import logger from './utils/logger.js';
import { getRedisClient, checkRedisHealth, closeRedisConnection } from './config/redis.js';
import { initQueue, closeQueue, enqueueCandidate } from './queue/producer.js';
import { runDiscovery, processCandidatesPipeline } from './core/discovery.js';
import { startScheduler, stopScheduler, triggerDiscoveryRun, getSchedulerState } from './scheduler/discoveryScheduler.js';
import { initDiscoveryDatabase, checkDatabaseHealth, closeDatabase, getDatabasePool } from './database/index.js';

let server;

async function bootstrap() {
  try {
    // 1. Validate configuration
    validateConfig();
    logger.info('Configuration loaded successfully.', {
      apify_enabled: config.DISCOVERY_APIFY_REDDIT_ENABLED,
      apify_actor: config.APIFY_REDDIT_ACTOR,
      collection_limit: config.DISCOVERY_REDDIT_COLLECTION_LIMIT,
      max_dynamic_queries: config.DISCOVERY_MAX_DYNAMIC_QUERIES_PER_RUN,
      scheduler_enabled: config.DISCOVERY_SCHEDULER_ENABLED
    });

    // 2. Initialize Redis
    getRedisClient();

    // 3. Initialize PostgreSQL
    await initDiscoveryDatabase();
    const dbStatus = await checkDatabaseHealth();
    if (dbStatus === 'disconnected' && config.DISCOVERY_DATABASE_URL) {
      throw new Error('PostgreSQL connection failed during initialization.');
    }

    // 4. Initialize Producer
    initQueue();

    // 5. Initialize application
    const app = express();
    app.use(express.json());

    // 6. Health check endpoint
    app.get('/health', async (req, res) => {
      const redisStatus = await checkRedisHealth();
      const databaseStatus = await checkDatabaseHealth();
      
      const isHealthy = redisStatus === 'connected' && databaseStatus !== 'disconnected';
      const statusCode = isHealthy ? 200 : 503;

      res.status(statusCode).json({
        service: 'discovery',
        status: isHealthy ? 'ok' : 'error',
        redis: redisStatus,
        database: databaseStatus,
        scheduler: getSchedulerState(),
        timestamp: new Date().toISOString()
      });
    });

    // Test Enqueue Route
    app.post('/test-enqueue', async (req, res) => {
      try {
        const candidate = req.body;
        if (!candidate || !candidate.platform || !candidate.platform_content_id) {
          return res.status(400).json({ error: 'Missing platform or platform_content_id' });
        }
        
        const job = await enqueueCandidate(candidate);
        res.status(200).json({ 
          message: 'Job enqueued successfully',
          jobId: job.id
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Discovery Run Manual Trigger
    app.post('/discovery/run', (req, res) => {
      try {
        const result = triggerDiscoveryRun();
        if (result.status === 'skipped') {
           return res.status(409).json(result);
        }
        res.status(202).json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Dynamic Query Apify Trigger
    app.post('/api/discovery/collect', async (req, res) => {
      try {
        const query = req.body?.query;
        if (!query) {
           return res.status(400).json({ error: 'Missing query parameter in request body' });
        }

        const result = await triggerDiscoveryRun({ query }, true);
        
        if (result.status === 'skipped') {
           return res.status(409).json(result);
        }

        if (result.sources_failed > 0) {
           return res.status(207).json({
             status: 'completed_with_source_error',
             sources: result.source_status || {},
             ...result
           });
        }

        res.status(200).json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // 7. Start server
    server = app.listen(config.PORT, async () => {
      logger.info(`Discovery Service successfully started on port ${config.PORT}`);
      
      startScheduler();
    });

  } catch (error) {
    logger.error(`Failed to start Discovery Service: ${error.message}`);
    process.exit(1);
  }
}

// 7. Handle graceful shutdown
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed.');
    });
  }

  // Close Producer & Queue resources
  await closeQueue();
  stopScheduler();

  // Close Redis connection
  await closeRedisConnection();
  
  // Close Postgres connection
  await closeDatabase();
  
  // Force close after 5s
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 5000);
  
  // Wait for connections to close, then exit
  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

bootstrap();
