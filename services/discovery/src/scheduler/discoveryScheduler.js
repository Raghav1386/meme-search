import cron from 'node-cron';
import crypto from 'crypto';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { runDiscovery } from '../core/discovery.js';

let isRunning = false;
let cronJob = null;

/**
 * Triggers a discovery run. Acts as the single entry point for both Cron and Manual triggering.
 * If a run is already in progress, it will skip execution and return a 409-style conflict response.
 */
export async function triggerDiscoveryRun(options = {}, wait = false) {
  if (isRunning) {
    logger.info('Discovery run skipped', { 
      event: 'discovery_run_skipped', 
      reason: 'discovery_run_already_in_progress' 
    });
    return { status: 'skipped', reason: 'discovery_run_already_in_progress' };
  }

  isRunning = true;
  
  // Format: discovery-YYYY-MM-DDTHH-mm-ss-uuid
  const runId = `discovery-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
  
  logger.info('Discovery run triggered by scheduler/manual API', { run_id: runId });

  if (wait) {
    try {
      const results = await runDiscovery(runId, options);
      logger.info('Discovery run finished', { event: 'discovery_run_completed', ...results });
      return results;
    } catch (err) {
      logger.error('Discovery run failed in scheduler execution', { run_id: runId, error: err.message });
      return { status: 'failed', error: err.message };
    } finally {
      isRunning = false;
    }
  } else {
    // Fire and forget - execute async
    (async () => {
      try {
        const results = await runDiscovery(runId, options);
        logger.info('Discovery run finished', { event: 'discovery_run_completed', ...results });
      } catch (err) {
        logger.error('Discovery run failed in scheduler execution', { run_id: runId, error: err.message });
      } finally {
        // GUARANTEED RELEASE
        isRunning = false;
      }
    })();
    return { status: 'started', run_id: runId };
  }
}

export function startScheduler() {
  if (!config.DISCOVERY_SCHEDULER_ENABLED) {
    logger.info('Discovery scheduler disabled via config (DISCOVERY_SCHEDULER_ENABLED=false)');
    return;
  }

  // Validate cron expression
  if (!cron.validate(config.DISCOVERY_SCHEDULE_CRON)) {
     logger.error('Invalid DISCOVERY_SCHEDULE_CRON expression. Scheduler will NOT start.', { cron: config.DISCOVERY_SCHEDULE_CRON });
     return;
  }

  logger.info(`Discovery scheduler started`, { cron: config.DISCOVERY_SCHEDULE_CRON });

  cronJob = cron.schedule(config.DISCOVERY_SCHEDULE_CRON, () => {
    logger.info('Cron triggered discovery run');
    triggerDiscoveryRun();
  });
}

export function stopScheduler() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('Discovery scheduler stopped');
  }
}

export function getSchedulerState() {
  return {
    enabled: config.DISCOVERY_SCHEDULER_ENABLED,
    running: isRunning
  };
}
