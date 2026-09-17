import logger from '../utils/logger.js';
import { MockSourceAdapter, MockFailSourceAdapter } from './mockSource.js';
import { YouTubeSourceAdapter } from './youtubeSource.js';
import { ApifyRedditSourceAdapter } from './apifyRedditSource.js';

// Central registry of all available sources
const adapters = [
  new MockSourceAdapter(),
  new MockFailSourceAdapter(),
  new YouTubeSourceAdapter(),
  new ApifyRedditSourceAdapter()
];

export async function executeSources(discoveryRunId, options = {}) {
  const candidates = [];
  const sourceMetrics = {
    executed: 0,
    skipped: 0,
    failed: 0,
    received: 0,
    details: {}
  };
  
  logger.info('Executing discovery sources', { 
    discovery_run_id: discoveryRunId,
    configured_sources: adapters.length
  });

  const context = {
    ...options,
    discovery_run_id: discoveryRunId,
    execution_time: Date.now()
  };

  for (const adapter of adapters) {
    if (!adapter.isEnabled) {
      sourceMetrics.skipped++;
      sourceMetrics.details[adapter.name] = { status: 'skipped', received: 0 };
      logger.info('Source disabled/skipped', { discovery_run_id: discoveryRunId, source_name: adapter.name });
      continue;
    }

    const startTime = Date.now();
    try {
      logger.info('Source execution started', { discovery_run_id: discoveryRunId, source_name: adapter.name });
      
      // Pass the entire context to the adapter
      const result = await adapter.fetch(context);
      const durationMs = Date.now() - startTime;
      
      let rawCandidates = [];
      let status = 'SUCCESS_WITH_DATA'; // default for legacy arrays
      let reason = null;
      let additionalDetails = {};

      if (Array.isArray(result)) {
        rawCandidates = result;
        status = rawCandidates.length > 0 ? 'SUCCESS_WITH_DATA' : 'SUCCESS_EMPTY';
      } else if (result && typeof result === 'object') {
        rawCandidates = result.candidates || [];
        status = result.status || 'SUCCESS_WITH_DATA';
        reason = result.reason || null;
        
        // Include any other keys like apifyRunId
        const { candidates: _c, status: _s, reason: _r, ...rest } = result;
        additionalDetails = rest;
      }

      const isSuccess = status === 'SUCCESS_WITH_DATA' || status === 'SUCCESS_EMPTY';
      const isPartial = typeof status === 'string' && status.includes('_PARTIAL');

      if (isSuccess || isPartial) {
        candidates.push(...rawCandidates);
        
        if (isSuccess) {
           sourceMetrics.executed++;
        } else {
           sourceMetrics.failed++; // Conceptually a source failure, but data was retrieved
        }
        sourceMetrics.received += rawCandidates.length;
        sourceMetrics.details[adapter.name] = { 
          status, 
          received: rawCandidates.length,
          reason,
          ...additionalDetails
        };
        
        logger.info('Source execution completed (or partial)', { 
          discovery_run_id: discoveryRunId, 
          source_name: adapter.name, 
          received_count: rawCandidates.length,
          duration_ms: durationMs,
          status,
          ...additionalDetails
        });
      } else {
        // CHARGE_LIMIT_REACHED, LOCAL_BUDGET_BLOCKED, ACTOR_FAILED, etc.
        sourceMetrics.failed++;
        sourceMetrics.details[adapter.name] = { 
          status, 
          received: 0, 
          reason,
          ...additionalDetails
        };
        
        logger.warn(`Source execution blocked or failed: ${status}`, {
          discovery_run_id: discoveryRunId,
          source_name: adapter.name,
          status,
          reason,
          duration_ms: durationMs,
          ...additionalDetails
        });
      }
    } catch (err) {
      const durationMs = Date.now() - startTime;
      sourceMetrics.failed++;
      sourceMetrics.details[adapter.name] = { status: 'UNHANDLED_ERROR', received: 0, error: err.message };
      
      // Isolate source failures - DO NOT CRASH
      logger.error('Source execution failed abruptly', { 
        discovery_run_id: discoveryRunId, 
        source_name: adapter.name, 
        duration_ms: durationMs,
        status: 'UNHANDLED_ERROR',
        error: err.message 
      });
    }
  }

  // Attach metrics to array object for backwards compatibility or upstream reading
  candidates._sourceMetrics = sourceMetrics;

  return candidates;
}
