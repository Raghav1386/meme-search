import express from 'express';
import config, { validateConfig } from './config/index.js';
import logger from './utils/logger.js';

let server;

async function bootstrap() {
  try {
    // 1. Validate configuration
    validateConfig();
    logger.info('Configuration loaded successfully.');

    // 2. Initialize application
    const app = express();
    app.use(express.json());

    // 3. Health check endpoint
    app.get('/health', (req, res) => {
      res.status(200).json({
        service: 'ingestion',
        status: 'ok',
        timestamp: new Date().toISOString()
      });
    });

    // 4. Start server
    server = app.listen(config.PORT, () => {
      logger.info(`Ingestion Service successfully started on port ${config.PORT}`);
    });

  } catch (error) {
    logger.error(`Failed to start Ingestion Service: ${error.message}`);
    process.exit(1);
  }
}

// 5. Handle graceful shutdown
function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });
    
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 5000);
  } else {
    process.exit(0);
  }
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
