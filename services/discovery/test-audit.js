import { Queue } from 'bullmq';
import { getRedisClient } from './src/config/redis.js';
import { normalizeCandidate } from './src/services/candidateNormalizer.js';
import { validateCandidate } from './src/services/candidateValidator.js';
import { enqueueCandidate, initQueue, closeQueue } from './src/queue/producer.js';

async function runAudit() {
  console.log("=== STARTING AUDIT ===");
  initQueue();
  const queue = initQueue();
  
  // Clean queue before starting
  await queue.obliterate({ force: true });
  console.log("Queue cleared.");

  console.log("\n--- TASK 8: CROSS-RUN TEST ---");
  const candidateCrossRun = normalizeCandidate({
    platform: 'mock',
    platform_content_id: 'cross-run-001',
    media_url: 'https://example.com/test.jpg'
  });
  
  // A. Submit once
  const jobA = await enqueueCandidate(candidateCrossRun);
  console.log(`Test A: Enqueued job ${jobA.id}. Status: ${await jobA.getState()}`);
  
  // B. Submit while active/waiting
  try {
     const jobB = await enqueueCandidate(candidateCrossRun);
     console.log(`Test B: Submitted again. Returned job ID: ${jobB.id}`);
     const activeJobs = await queue.getActive();
     const waitingJobs = await queue.getWaiting();
     console.log(`Total Active/Waiting jobs: ${activeJobs.length + waitingJobs.length}`);
  } catch (e) {
     console.log(`Test B Error: ${e.message}`);
  }

  // C. Allow completion / removal
  // We'll manually remove it to simulate retention policy expiration
  await jobA.remove();
  console.log(`Test C: Job manually removed (simulating expiration).`);
  const jobC = await enqueueCandidate(candidateCrossRun);
  console.log(`Test C: Submitted again after removal. New job created? ${jobC.id !== undefined}, ID: ${jobC.id}`);

  console.log("\n--- TASK 9: SAME-RUN TEST ---");
  // Simulated via Discovery run logic directly in this script
  const seenInRun = new Set();
  const sameRunCandidates = [
    { platform: 'mock', platform_content_id: 'same-run-001', media_url: 'https://example.com/1.jpg' },
    { platform: 'mock', platform_content_id: 'same-run-001', media_url: 'https://example.com/1.jpg' }
  ];
  let accepted = 0;
  let duplicates = 0;
  for (const raw of sameRunCandidates) {
      const normalized = normalizeCandidate(raw);
      if (seenInRun.has(normalized.candidate_id)) {
          duplicates++;
      } else {
          seenInRun.add(normalized.candidate_id);
          accepted++;
      }
  }
  console.log(`Same-Run: accepted=${accepted}, duplicates=${duplicates}`);


  console.log("\n--- TASK 10: DIFFERENT PLATFORM TEST ---");
  const diff1 = normalizeCandidate({ platform: 'reddit', platform_content_id: 'abc123', media_url: 'http://a' });
  const diff2 = normalizeCandidate({ platform: 'youtube', platform_content_id: 'abc123', media_url: 'http://a' });
  console.log(`Reddit ID: ${diff1.candidate_id}`);
  console.log(`YouTube ID: ${diff2.candidate_id}`);
  console.log(`Are they same? ${diff1.candidate_id === diff2.candidate_id}`);

  console.log("\n--- TASK 11: INVALID CANDIDATE TEST ---");
  const invalid = normalizeCandidate({ platform: 'mock', media_url: 'http://a' }); // missing content_id
  const validation = validateCandidate(invalid);
  console.log(`Invalid candidate valid? ${validation.valid}`);
  console.log(`Errors: ${validation.errors.join(', ')}`);

  await closeQueue();
  console.log("\n=== AUDIT COMPLETE ===");
  process.exit(0);
}

runAudit().catch(console.error);
