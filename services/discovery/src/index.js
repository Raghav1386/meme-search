import express from 'express';
import config, { validateConfig } from './config/index.js';
import logger from './utils/logger.js';
import { getRedisClient, checkRedisHealth, closeRedisConnection } from './config/redis.js';
import { initQueue, closeQueue, enqueueCandidate } from './queue/producer.js';
import { runDiscovery } from './core/discovery.js';
import { startScheduler, stopScheduler } from './core/scheduler.js';
import { initDiscoveryDatabase } from './database/index.js';

let server;

async function bootstrap() {
  try {
    // 1. Validate configuration
    validateConfig();
    logger.info('Configuration loaded successfully.');

    // 2. Initialize Redis
    getRedisClient();

    // 3. Initialize Producer
    initQueue();

    // 4. Initialize application
    const app = express();
    app.use(express.json());

    // 5. Health check endpoint
    app.get('/health', async (req, res) => {
      const redisStatus = await checkRedisHealth();
      res.status(200).json({
        service: 'discovery',
        status: 'ok',
        redis: redisStatus,
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

    // Test Discovery Run Route
    app.post('/test-discovery/run', async (req, res) => {
      try {
        const results = await runDiscovery();
        res.status(200).json(results);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // 6. Start server
    server = app.listen(config.PORT, async () => {
      logger.info(`Discovery Service successfully started on port ${config.PORT}`);
      
      await initDiscoveryDatabase();
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
