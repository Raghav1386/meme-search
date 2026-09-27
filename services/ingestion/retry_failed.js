import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

async function retryFailed() {
  const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue('meme-ingestion', { connection });

  console.log("Retrying all failed jobs...");
  const failedJobs = await queue.getFailed();
  
  for (const job of failedJobs) {
    await job.retry();
    console.log(`Re-queued job: ${job.id}`);
  }
  
  console.log(`Successfully moved ${failedJobs.length} jobs back to the waiting queue!`);
  process.exit(0);
}

retryFailed().catch(console.error);
