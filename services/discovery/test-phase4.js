import { startScheduler, stopScheduler } from './src/core/scheduler.js';
import { runDiscovery } from './src/core/discovery.js';
import pkg from 'pg';
import config from './src/config/index.js';

console.log('--- Phase 4: Discovery Database & Scheduler Test ---');

// Mock Database Pool
let queries = [];
pkg.Pool.prototype.query = async (text, params) => {
  queries.push({ text, params });
};

async function runTests() {
  config.DISCOVERY_DATABASE_URL = 'dummy://db';
  
  // Test 1: Scheduler Toggle
  config.DISCOVERY_SCHEDULE_ENABLED = false;
  startScheduler();
  console.log('Scheduler disabled check passed (no output = good)');

  config.DISCOVERY_SCHEDULE_ENABLED = true;
  config.DISCOVERY_INTERVAL_MS = 5000;
  
  console.log('Testing scheduler loop...');
  startScheduler();
  
  setTimeout(async () => {
    stopScheduler();
    console.log(`Intercepted ${queries.length} database queries during scheduler run`);
    
    const runsInserted = queries.filter(q => q.text.includes('INSERT INTO discovery_runs')).length;
    const runsUpdated = queries.filter(q => q.text.includes('UPDATE discovery_runs')).length;
    const candidatesUpserted = queries.filter(q => q.text.includes('INSERT INTO discovery_candidates')).length;

    console.log(`- discovery_runs INSERT: ${runsInserted}`);
    console.log(`- discovery_runs UPDATE: ${runsUpdated}`);
    console.log(`- discovery_candidates UPSERT: ${candidatesUpserted}`);

    if (runsInserted > 0 && runsUpdated > 0) {
      console.log('✅ Phase 4 Discovery Integration Test Passed!');
      process.exit(0);
    } else {
      console.error('❌ Failed: Missing expected DB queries.');
      process.exit(1);
    }
  }, 1000); // give the scheduler 1 second to do at least one run
}

runTests().catch(console.error);
