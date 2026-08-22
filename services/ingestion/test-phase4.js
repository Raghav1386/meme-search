import { initWorker, closeWorker } from './src/queue/worker.js';
import { getRedisClient, closeRedisConnection } from './src/config/redis.js';
import { Queue } from 'bullmq';
import pkg from 'pg';
import config from './src/config/index.js';

console.log('--- Phase 4: Ingestion Integration Boundary Test ---');

// 1. Mock DB
let queries = [];
pkg.Pool.prototype.query = async (text, params) => {
  queries.push({ text, params });
};

// 2. Mock Global Fetch for Python Embedding Boundary
let fetchCalls = [];
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  if (typeof url === 'string' && url.includes('127.0.0.1')) {
    fetchCalls.push({ url, options });
    if (options.body && JSON.parse(options.body).b2_key.includes('fail')) {
      throw new Error('Simulated Python service down');
    }
    return { ok: true, status: 200 };
  }
  return originalFetch(url, options);
};

// 3. Mock S3 and other stuff inside the pipeline using env limits
process.env.MEDIA_STORAGE_ENABLED = 'false';

async function runTests() {
  config.DISCOVERY_DATABASE_URL = 'dummy://db';
  
  const queue = new Queue('meme-ingestion', { connection: getRedisClient() });
  await queue.drain(true);
  await queue.obliterate().catch(() => {});

  const worker = initWorker();

  // Job 1: Successful embedding integration
  await queue.add('test-candidate', {
    platform: 'mock',
    platform_content_id: 'embed-success-123',
    candidate_id: 'mock-embed-success-123',
    media_url: 'https://httpbin.org/image/jpeg',
    caption: 'Test Meme'
  });

  // Job 2: Failed embedding integration (worker should not fail)
  await queue.add('test-candidate', {
    platform: 'fail',
    platform_content_id: 'embed-fail-456',
    candidate_id: 'mock-embed-fail-456',
    media_url: 'https://httpbin.org/image/jpeg',
    caption: 'Test Fail Meme'
  });

  let completedJobs = 0;

  worker.on('completed', async (job) => {
    completedJobs++;
    if (completedJobs === 2) {
      console.log('All test jobs processed.');
      
      const ingestedUpdates = queries.filter(q => q.text.includes("status = $1, media_url = $2") && q.params[0] === 'ingested');
      const embedSuccessUpdates = queries.filter(q => q.text.includes("embedding_status = $1") && q.params[0] === 'success');
      const embedFailUpdates = queries.filter(q => q.text.includes("embedding_status = $1") && q.params[0] === 'failed');
      
      console.log(`- Fetch calls to python: ${fetchCalls.length}`);
      console.log(`- Candidates marked ingested: ${ingestedUpdates.length}`);
      console.log(`- Embeddings marked success: ${embedSuccessUpdates.length}`);
      console.log(`- Embeddings marked failed: ${embedFailUpdates.length}`);

      let passed = true;
      if (fetchCalls.length !== 2) passed = false;
      if (ingestedUpdates.length !== 2) passed = false;
      if (embedSuccessUpdates.length !== 1) passed = false;
      if (embedFailUpdates.length !== 1) passed = false;

      if (passed) {
        console.log('✅ Phase 4 Ingestion Boundary Test Passed!');
      } else {
        console.error('❌ Phase 4 Ingestion Boundary Test Failed!');
      }

      await closeWorker();
      await closeRedisConnection();
      await queue.close();
      process.exit(passed ? 0 : 1);
    }
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ Job failed unexpectedly: ${err.message}`);
    process.exit(1);
  });
}

runTests().catch(console.error);
