import { Worker } from 'bullmq';
import { getRedisClient } from '../config/redis.js';
import logger from '../utils/logger.js';
import { acquireMedia } from '../services/mediaAcquisition.js';
import { inspectMedia, UnsupportedMediaError, CorruptMediaError, DimensionLimitError, FileSizeLimitError } from '../services/mediaInspector.js';
import { normalizeImage, NormalizationError, InputValidationError } from '../services/imageNormalizer.js';
import { uploadCanonicalArtifact } from '../services/mediaStorage.js';
import { getDatabasePool } from '../database/index.js';
import config from '../config/index.js';
import fs from 'fs/promises';

let ingestionWorker = null;

export function initWorker() {
  if (!ingestionWorker) {
    const connection = getRedisClient();
    const concurrency = parseInt(process.env.INGESTION_WORKER_CONCURRENCY || '2', 10);

    ingestionWorker = new Worker('meme-ingestion', async (job) => {
      const candidate = job.data;
      
      logger.info(`Worker started processing job`, {
        jobId: job.id,
        candidateId: candidate.candidate_id,
        platform: candidate.platform
      });

      // Basic structure validation
      if (!candidate || !candidate.platform || !candidate.platform_content_id) {
        throw new Error('Invalid candidate structure: missing platform or platform_content_id');
      }

      if (!candidate.media_url) {
        logger.info(`Candidate has no media_url, skipping acquisition`, { jobId: job.id });
        return { status: 'skipped', reason: 'no_media_url' };
      }

      // Simulated controlled failure for testing purposes
      if (candidate.platform === 'test-fail') {
        throw new Error('Simulated processing failure for testing');
      }

      logger.info(`Candidate received and validated successfully, starting media acquisition`, { jobId: job.id });
      
      const db = getDatabasePool();
      const markPermanentFailure = async (reason) => {
        if (db) {
          await db.query(
            'UPDATE discovery_candidates SET status = $1, error_reason = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            ['failed', reason, candidate.candidate_id]
          ).catch(() => {});
        }
      };
      
      const acqResult = await acquireMedia(candidate);
      let normResult = null;

      try {
        if (acqResult.status === 'failed') {
          const isTransient = 
            acqResult.error.includes('Timeout') || 
            acqResult.error.includes('fetch failed') ||
            acqResult.error.includes('HTTP Error 429') ||
            acqResult.error.match(/HTTP Error 5\d\d/);

          if (isTransient) {
            throw new Error(`Transient media acquisition failure: ${acqResult.error}`);
          } else {
            await markPermanentFailure(acqResult.error);
            logger.warn(`Permanent media acquisition failure`, { jobId: job.id, candidateId: candidate.candidate_id, reason: acqResult.error });
            return { status: 'failed', reason: acqResult.error };
          }
        }
        
        if (acqResult.status === 'skipped') {
          return { status: 'skipped', reason: acqResult.error };
        }

        // --- Phase 3.7.3-A Media Inspection ---
        let inspectionResult = null;
        try {
          inspectionResult = await inspectMedia(acqResult.local_path);
          logger.info(`Media inspection successful`, { 
            jobId: job.id, 
            candidateId: candidate.candidate_id, 
            media_type: inspectionResult.media_type,
            mime_type: inspectionResult.mime_type,
            dimensions: `${inspectionResult.width}x${inspectionResult.height}`,
            size: inspectionResult.file_size_bytes 
          });
        } catch (err) {
          const isPermanent = 
            err instanceof UnsupportedMediaError ||
            err instanceof CorruptMediaError ||
            err instanceof DimensionLimitError ||
            err instanceof FileSizeLimitError;

          if (isPermanent) {
            await markPermanentFailure(err.message);
            logger.warn(`Permanent media inspection failure`, { jobId: job.id, candidateId: candidate.candidate_id, reason: err.message });
            return { status: 'failed', reason: err.message };
          } else {
            throw new Error(`Transient media inspection failure: ${err.message}`);
          }
        }

        // --- Phase 3.7.4-A Normalization ---
        try {
          normResult = await normalizeImage(acqResult.local_path);
          logger.info(`Image normalization successful`, {
            jobId: job.id,
            candidateId: candidate.candidate_id,
            canonical_path: normResult.outputPath,
            normalized: true,
            original_dimensions: `${inspectionResult.width}x${inspectionResult.height}`,
            canonical_dimensions: `${normResult.width}x${normResult.height}`,
            original_format: inspectionResult.mime_type,
            canonical_format: normResult.format,
            sizeBytes: normResult.sizeBytes
          });
        } catch (err) {
          const isPermanent = err instanceof InputValidationError || err instanceof NormalizationError;
          if (isPermanent) {
            await markPermanentFailure(err.message);
            logger.warn(`Permanent image normalization failure`, { jobId: job.id, candidateId: candidate.candidate_id, reason: err.message });
            return { status: 'failed', reason: err.message };
          } else {
            throw new Error(`Transient image normalization failure: ${err.message}`);
          }
        }

        // --- Phase 3.7.5 Media Storage ---
        let storageResult = null;
        try {
          const objectKey = `memes/${candidate.platform}/${candidate.candidate_id}.jpeg`;
          storageResult = await uploadCanonicalArtifact({
            filePath: normResult.outputPath,
            objectKey,
            contentType: 'image/jpeg',
            contentLength: normResult.sizeBytes
          });
        } catch (err) {
          if (err.isTransient) {
            throw new Error(`Transient media storage failure: ${err.message}`);
          } else {
            await markPermanentFailure(err.message);
            logger.warn(`Permanent media storage failure`, { jobId: job.id, candidateId: candidate.candidate_id, reason: err.message });
            return { status: 'failed', reason: err.message };
          }
        }

        // --- Phase 4 Database Update ---
        if (db) {
          try {
            await db.query(
               'UPDATE discovery_candidates SET status = $1, media_url = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
               ['ingested', storageResult.url, candidate.candidate_id]
            );
          } catch (dbErr) {
             logger.error('Failed to update discovery_candidates status to ingested', { error: dbErr.message });
          }
        }

        // --- Phase 4 Embedding Integration Boundary ---
        if (db) {
           try {
             const objectKey = `memes/${candidate.platform}/${candidate.candidate_id}.jpeg`;
             const response = await fetch(`${config.PYTHON_SERVICE_URL}/index-meme`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                 b2_key: objectKey,
                 caption: candidate.caption || candidate.title || null
               })
             });
             
             if (!response.ok) {
                throw new Error(`Python service responded with status: ${response.status}`);
             }
             
             await db.query(
               'UPDATE discovery_candidates SET embedding_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
               ['success', candidate.candidate_id]
             );
           } catch (embedErr) {
             logger.warn('Embedding integration boundary failed. Candidate ingested but not indexed.', { error: embedErr.message });
             await db.query(
               'UPDATE discovery_candidates SET embedding_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
               ['failed', candidate.candidate_id]
             ).catch(() => {});
           }
        }

        // Simulated downstream failure testing hook
        if (candidate.platform === 'test-downstream-fail') {
          throw new Error('Simulated transient downstream processing failure for testing');
        }

        return { 
          status: 'COMPLETED', 
          acquisition: acqResult, 
          metadata: inspectionResult,
          normalization: normResult,
          artifact: storageResult
        };
      } finally {
        // Cleanup acquisition temp file unconditionally
        if (acqResult?.local_path) {
          try {
            await fs.unlink(acqResult.local_path);
            logger.info(`Successfully cleaned up acquisition temp file`, { path: acqResult.local_path });
          } catch (err) {
            logger.warn(`Failed to cleanup acquisition temp file`, { path: acqResult.local_path, error: err.message });
          }
        }
        // Cleanup normalized artifact since downstream processing does not yet permanently store it
        if (normResult?.outputPath) {
          try {
            await fs.unlink(normResult.outputPath);
            logger.info(`Successfully cleaned up normalized temp file`, { path: normResult.outputPath });
          } catch (err) {
            logger.warn(`Failed to cleanup normalized temp file`, { path: normResult.outputPath, error: err.message });
          }
        }
      }
    }, {
      connection,
      concurrency
    });

    ingestionWorker.on('completed', (job) => {
      logger.info(`Worker completed job`, { jobId: job.id });
    });

    ingestionWorker.on('failed', (job, err) => {
      const attemptsMade = job?.attemptsMade || 0;
      const maxAttempts = job?.opts?.attempts || 3;
      const isFinal = attemptsMade >= maxAttempts;
      
      if (isFinal) {
        logger.error(`Worker final FAILED state for job`, { 
          jobId: job?.id || 'unknown', 
          error: err.message,
          attemptsMade
        });
      } else {
        logger.warn(`Worker failed attempt, will retry`, { 
          jobId: job?.id || 'unknown', 
          error: err.message,
          attemptsMade
        });
      }
    });

    logger.info(`BullMQ Worker initialized for meme-ingestion queue with concurrency ${concurrency}`);
  }
  return ingestionWorker;
}

export async function closeWorker() {
  if (ingestionWorker) {
    await ingestionWorker.close();
    ingestionWorker = null;
    logger.info('BullMQ Worker connection closed');
  }
}
