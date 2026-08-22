import { runDiscovery } from './discovery.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

let intervalId = null;

export function startScheduler() {
  if (!config.DISCOVERY_SCHEDULE_ENABLED) {
    logger.info('Discovery scheduler disabled via config (DISCOVERY_SCHEDULE_ENABLED=false)');
    return;
  }

  logger.info(`Discovery scheduler started. Interval: ${config.DISCOVERY_INTERVAL_MS}ms`);

  // Run immediately on start
  scheduleNextRun();
}

export function stopScheduler() {
  if (intervalId) {
    clearTimeout(intervalId);
    intervalId = null;
    logger.info('Discovery scheduler stopped');
  }
}

async function scheduleNextRun() {
  try {
    await runDiscovery();
  } catch (err) {
    logger.error('Scheduled discovery run encountered an unexpected error', { error: err.message });
  } finally {
    // Schedule the next run after the current one completes
    intervalId = setTimeout(scheduleNextRun, config.DISCOVERY_INTERVAL_MS);
  }
}
