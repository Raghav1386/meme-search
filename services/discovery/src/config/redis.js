import Redis from 'ioredis';
import config from './index.js';
import logger from '../utils/logger.js';

let redisClient = null;

export function getRedisClient() {
  if (!redisClient) {
    // Upstash connection string usually starts with rediss://
    // The ioredis client requires family: 0 to properly resolve IPv4/IPv6
    // maxRetriesPerRequest is set to null, which is a requirement for BullMQ
    redisClient = new Redis(config.REDIS_URL, {
      family: 0,
      maxRetriesPerRequest: null,
      retryStrategy(times) {
        // Exponential backoff with a max delay of 3 seconds
        const delay = Math.min(times * 50, 3000);
        return delay;
      }
    });

    redisClient.on('connecting', () => {
      logger.info('Redis connecting...');
    });

    redisClient.on('ready', () => {
      logger.info('Redis connection ready');
    });

    redisClient.on('error', (err) => {
      logger.error(`Redis connection error: ${err.message}`);
    });

    redisClient.on('close', () => {
      logger.info('Redis connection closed');
    });

    redisClient.on('reconnecting', () => {
      logger.warn('Redis reconnecting...');
    });
  }
  return redisClient;
}

export async function checkRedisHealth() {
  try {
    if (!redisClient || redisClient.status !== 'ready') {
      return 'disconnected';
    }
    const response = await redisClient.ping();
    if (response === 'PONG') {
      return 'connected';
    }
    return 'unknown';
  } catch (err) {
    logger.error(`Redis health check failed: ${err.message}`);
    return 'error';
  }
}

export async function closeRedisConnection() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
