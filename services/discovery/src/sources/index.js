import logger from '../utils/logger.js';
import { MockSourceAdapter, MockFailSourceAdapter } from './mockSource.js';
import { RedditSourceAdapter } from './redditSource.js';
import { YouTubeSourceAdapter } from './youtubeSource.js';

// Central registry of all available sources
const adapters = [
  new MockSourceAdapter(),
  new MockFailSourceAdapter(),
  new RedditSourceAdapter(),
  new YouTubeSourceAdapter()
];

export async function executeSources(discoveryRunId) {
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
      
      const rawCandidates = await adapter.fetch(context);
      const durationMs = Date.now() - startTime;
      
      candidates.push(...rawCandidates);
      
      sourceMetrics.executed++;
      sourceMetrics.received += rawCandidates.length;
      sourceMetrics.details[adapter.name] = { status: 'success', received: rawCandidates.length };
      
      logger.info('Source execution completed', { 
        discovery_run_id: discoveryRunId, 
        source_name: adapter.name, 
        received_count: rawCandidates.length,
        duration_ms: durationMs,
        status: 'success'
      });
    } catch (err) {
      const durationMs = Date.now() - startTime;
      sourceMetrics.failed++;
      sourceMetrics.details[adapter.name] = { status: 'failed', received: 0, error: err.message };
      
      // Isolate source failures - DO NOT CRASH
      logger.error('Source execution failed', { 
        discovery_run_id: discoveryRunId, 
        source_name: adapter.name, 
        duration_ms: durationMs,
        status: 'failed',
        error: err.message 
      });
    }
  }

  // Attach metrics to array object for backwards compatibility or upstream reading
  candidates._sourceMetrics = sourceMetrics;

  return candidates;
}
