import { Queue } from 'bullmq';
import { getRedisClient } from './src/config/redis.js';
import { normalizeCandidate } from './src/services/candidateNormalizer.js';
import { validateCandidate } from './src/services/candidateValidator.js';
import { enqueueCandidate, initQueue, closeQueue } from './src/queue/producer.js';
import { runDiscovery } from './src/core/discovery.js';

async function runTests() {
  console.log("=== PHASE 3.4 TESTS ===");
  initQueue();
  const queue = initQueue();
  await queue.obliterate({ force: true });
  console.log("Queue cleared.");

  // Test 1: Valid Candidate
  const c1 = normalizeCandidate({ platform: 'mock', platform_content_id: 'phase34-valid-001', media_url: 'http://a' });
  const r1 = await enqueueCandidate(c1, 'test-run');
  console.log(`Test 1 (Valid candidate): ${r1.status} (Expected: queued)`);

  // Test 3: Same candidate while existing BullMQ job exists
  const r3 = await enqueueCandidate(c1, 'test-run');
  console.log(`Test 3 (Active queue duplicate): ${r3.status} (Expected: existing)`);

  // Test 4: Different Platform
  const c4 = normalizeCandidate({ platform: 'reddit', platform_content_id: 'same-id', media_url: 'http://a' });
  const c4b = normalizeCandidate({ platform: 'youtube', platform_content_id: 'same-id', media_url: 'http://a' });
  const r4 = await enqueueCandidate(c4, 'test-run');
  const r4b = await enqueueCandidate(c4b, 'test-run');
  console.log(`Test 4 (Different platform): ${r4.status}, ${r4b.status}. IDs distinct? ${r4.job_id !== r4b.job_id} (Expected: distinct jobs)`);

  // Test 6: Queue failure simulation
  // To safely mock queue failure, we can close the connection and try to enqueue.
  await closeQueue(); 
  // Call enqueue without queue initialized (throws Error: Queue not initialized inside)
  const r6 = await enqueueCandidate(c1, 'test-run');
  console.log(`Test 6 (Queue failure isolated): ${r6.status} (Expected: failed)`);
  
  console.log("\n=== TESTS COMPLETE ===");
  process.exit(0);
}

runTests().catch(console.error);
