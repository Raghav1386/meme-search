import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Basic budget tracking abstraction for Phase 1.
 * Ensures that Apify is properly configured before running an Actor,
 * and provides a hook for future budget tracking and limits.
 */
export class ApifyBudgetManager {
  static isExhausted = false;
  static exhaustionReason = null;

  static markExhausted(reason) {
    this.isExhausted = true;
    this.exhaustionReason = reason || 'Unknown Apify budget limitation';
    logger.error('ApifyBudgetManager: Account marked as exhausted. Blocking future runs.', { reason: this.exhaustionReason });
  }

  static async checkCanRun() {
    if (!config.DISCOVERY_APIFY_REDDIT_ENABLED) {
      throw new Error('Apify Reddit integration is disabled in configuration');
    }

    if (!config.APIFY_API_TOKEN || config.APIFY_API_TOKEN === 'your_apify_token_here') {
      throw new Error('APIFY_API_TOKEN is missing or invalid');
    }

    if (!config.APIFY_REDDIT_ACTOR) {
      throw new Error('APIFY_REDDIT_ACTOR is not configured');
    }

    if (this.isExhausted) {
      throw new Error(`Apify budget exhausted. Blocked by ApifyBudgetManager. Reason: ${this.exhaustionReason}`);
    }

    // In future phases, this is where we will query Apify for current monthly usage,
    // estimated cost, or check against a local DB table storing usage history to 
    // prevent runaway budget consumption.
    logger.info('ApifyBudgetManager: Run permitted', {
      actor: config.APIFY_REDDIT_ACTOR
    });

    return true;
  }

  static recordRunUsage(runId, actorId, datasetId, itemsCount) {
    // Stub for tracking actual usage/cost post-execution
    logger.info('ApifyBudgetManager: Run usage recorded', {
      local_run_id: runId,
      actor: actorId,
      dataset_id: datasetId,
      items_retrieved: itemsCount
    });
  }
}
