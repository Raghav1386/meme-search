import express from 'express';
import config, { validateConfig } from './config/index.js';
import logger from './utils/logger.js';
import { getRedisClient, checkRedisHealth, closeRedisConnection } from './config/redis.js';
import { initWorker, closeWorker } from './queue/worker.js';

let server;

async function bootstrap() {
  try {
    // 1. Validate configuration
    validateConfig();
    logger.info('Configuration loaded successfully.');

    // 2. Initialize Redis
    getRedisClient();

    // 3. Initialize Worker
    initWorker();

    // 4. Initialize application
    const app = express();
    app.use(express.json());

    // 5. Health check endpoint
    app.get('/health', async (req, res) => {
      const redisStatus = await checkRedisHealth();
      res.status(200).json({
        service: 'ingestion',
        status: 'ok',
        redis: redisStatus,
        timestamp: new Date().toISOString()
      });
    });

    // 6. Start server
    server = app.listen(config.PORT, () => {
      logger.info(`Ingestion Service successfully started on port ${config.PORT}`);
    });

  } catch (error) {
    logger.error(`Failed to start Ingestion Service: ${error.message}`);
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

  // Close Worker
  await closeWorker();

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
