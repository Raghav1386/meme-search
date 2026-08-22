import { Queue } from 'bullmq';
import { getRedisClient } from '../config/redis.js';
import logger from '../utils/logger.js';

let ingestionQueue = null;

export function initQueue() {
  if (!ingestionQueue) {
    const connection = getRedisClient();
    ingestionQueue = new Queue('meme-ingestion', { connection });
    logger.info('BullMQ Producer initialized for meme-ingestion queue');
  }
  return ingestionQueue;
}

export async function enqueueCandidate(candidate, discoveryRunId = 'unknown-run') {
  if (!ingestionQueue) {
    return {
      status: 'failed',
      candidate_id: candidate.candidate_id,
      error: 'Queue not initialized'
    };
  }

  // Deterministic job ID: strictly mapped to candidate_id (platform-platform_content_id)
  const jobId = candidate.candidate_id;

  try {
    const existingJob = await ingestionQueue.getJob(jobId);
    if (existingJob) {
      logger.info('Discovery candidate already active in queue', {
        discovery_run_id: discoveryRunId,
        candidate_id: candidate.candidate_id,
        job_id: existingJob.id,
        queue: 'meme-ingestion',
        result: 'existing'
      });
      return {
        status: 'existing',
        candidate_id: candidate.candidate_id,
        job_id: existingJob.id
      };
    }

    const job = await ingestionQueue.add('process-candidate', candidate, {
      jobId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s, 10s, 20s
      },
      removeOnComplete: {
        age: 3600, // keep up to 1 hour
        count: 1000,
      },
      removeOnFail: {
        age: 24 * 3600, // keep up to 24 hours
      }
    });

    logger.info(`Discovery candidate queued`, {
      discovery_run_id: discoveryRunId,
      candidate_id: candidate.candidate_id,
      platform: candidate.platform,
      platform_content_id: candidate.platform_content_id,
      queue: 'meme-ingestion',
      job_id: job.id
    });

    return {
      status: 'queued',
      candidate_id: candidate.candidate_id,
      job_id: job.id,
      queue: 'meme-ingestion'
    };
  } catch (err) {
    logger.error(`Discovery candidate queue failure`, { 
      discovery_run_id: discoveryRunId,
      candidate_id: candidate.candidate_id,
      queue: 'meme-ingestion',
      error_message: err.message,
      error_type: err.name
    });
    
    return {
      status: 'failed',
      candidate_id: candidate.candidate_id,
      error: err.message
    };
  }
}

export async function closeQueue() {
  if (ingestionQueue) {
    await ingestionQueue.close();
    ingestionQueue = null;
    logger.info('BullMQ Producer connection closed');
  }
}
