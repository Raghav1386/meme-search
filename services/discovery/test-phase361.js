import { SourceAdapter } from './src/sources/sourceAdapter.js';
import { MockSourceAdapter, MockFailSourceAdapter } from './src/sources/mockSource.js';
import { executeSources } from './src/sources/index.js';
import { runDiscovery } from './src/core/discovery.js';
import { initQueue, closeQueue } from './src/queue/producer.js';
import crypto from 'crypto';

async function runTests() {
  console.log("=== PHASE 3.6.1 TESTS ===");

  // 1 & 2. Contract Existence & Conformance
  const mock = new MockSourceAdapter();
  console.log(`TEST 1/2 (Contract): Extends SourceAdapter? ${mock instanceof SourceAdapter}`);
  console.log(`TEST 1/2 (Contract): Has name? ${mock.name === 'mock'}`);
  console.log(`TEST 1/2 (Contract): Has isEnabled? ${typeof mock.isEnabled === 'boolean'}`);
  console.log(`TEST 1/2 (Contract): Has fetch? ${typeof mock.fetch === 'function'}`);

  // 3 & 5. Enabled Source Executes & Returns Raw Candidates
  const ctx = { discovery_run_id: crypto.randomUUID() };
  if (mock.isEnabled) {
    const raw = await mock.fetch(ctx);
    console.log(`TEST 3/5 (Fetch): Received ${raw.length} candidates. First is raw? ${!raw[0].hasOwnProperty('trend_score') && raw[0].platform === '  MOCK  '}`);
  }

  // 6. Source failure isolation & 7. Multi-source aggregate
  // MockFailSourceAdapter throws an error. executeSources should catch it and continue.
  const aggregated = await executeSources(ctx.discovery_run_id);
  console.log(`TEST 6/7/8 (Aggregate/Isolation): Total candidates collected = ${aggregated.length}. Did not crash.`);

  // 9. Metrics
  const metrics = aggregated._sourceMetrics;
  console.log(`TEST 9 (Metrics): Executed=${metrics.executed}, Skipped=${metrics.skipped}, Failed=${metrics.failed}`);
  console.log(`TEST 9 (Metrics): Source A=${metrics.details['mock'].status}, Source B=${metrics.details['mock-fail'].status}`);

  console.log("\n=== STARTING INTEGRATION PIPELINE VERIFICATION ===");
  // Initialize Queue for end-to-end pipeline run
  initQueue();
  const results = await runDiscovery();
  console.log(`PIPELINE VERIFICATION: status = ${results.status}`);
  console.log(`PIPELINE METRICS: Sources Configured=${results.sources_configured}, Executed=${results.sources_executed}, Failed=${results.sources_failed}`);
  console.log(`PIPELINE METRICS: Received=${results.candidates_received}, Queued=${results.candidates_queued}`);
  
  await closeQueue();
  process.exit(0);
}

runTests().catch(console.error);
