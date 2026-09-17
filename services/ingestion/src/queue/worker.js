import { Worker } from 'bullmq';
import { getRedisClient } from '../config/redis.js';
import logger from '../utils/logger.js';
import { getDatabasePool } from '../database/index.js';
import { downloadMedia, DownloadError } from '../services/mediaDownloader.js';
import { validateImage, ValidationError } from '../services/imageValidator.js';
import { generateFilename } from '../utils/filenameGenerator.js';
import { uploadToB2, StorageError } from '../services/b2Storage.js';
import { indexMeme, IndexerError } from '../services/pythonIndexer.js';
import { calculateSha256, calculatePhash, hammingDistance } from '../utils/hasher.js';
import crypto from 'crypto';
import config from '../config/index.js';

const STATES = {
  QUEUED: 0,
  VALIDATING: 1,
  DOWNLOADING: 2,
  MEDIA_VALIDATED: 3,
  HASHING: 4,
  DEDUPLICATING: 5,
  STORING: 6,
  OCR: 7,
  EMBEDDING: 8,
  COMPLETED: 9,
  FAILED: 10
};

let ingestionWorker = null;

async function updateState(db, candidateId, status, extraFields = {}) {
  const keys = Object.keys(extraFields);
  if (keys.length === 0) {
    await db.query('UPDATE ingestion_candidates SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE candidate_id = $2', [status, candidateId]);
    return;
  }
  const setClauses = keys.map((k, i) => `${k} = $${i + 3}`).join(', ');
  const values = [status, candidateId, ...keys.map(k => extraFields[k])];
  await db.query(`UPDATE ingestion_candidates SET status = $1, updated_at = CURRENT_TIMESTAMP, ${setClauses} WHERE candidate_id = $2`, values);
}

export function initWorker() {
  if (!ingestionWorker) {
    const connection = getRedisClient();
    const queueName = config.INGESTION_QUEUE_NAME || 'meme-ingestion-test';
    const concurrency = parseInt(config.INGESTION_WORKER_CONCURRENCY || '1', 10);

    ingestionWorker = new Worker(queueName, async (job) => {
      const db = getDatabasePool();
      const payload = job.data;
      const candidateId = payload.candidate_id;

      if (!payload || !payload.platform || !payload.candidate_id) {
        throw new Error('Invalid candidate structure');
      }

      logger.info(`Worker started processing job`, { jobId: job.id, candidate_id: candidateId });

      // 1. Candidate-level idempotency
      let res = await db.query(
        `INSERT INTO ingestion_candidates (candidate_id, platform, platform_content_id, source_media_url, caption, status) 
         VALUES ($1, $2, $3, $4, $5, 'QUEUED') 
         ON CONFLICT (candidate_id) DO NOTHING RETURNING *`,
        [candidateId, payload.platform, payload.platform_content_id, payload.media_url, payload.caption]
      );
      
      let candidateRow;
      if (res.rows.length === 0) {
        // Existed
        res = await db.query('SELECT * FROM ingestion_candidates WHERE candidate_id = $1', [candidateId]);
        candidateRow = res.rows[0];
      } else {
        candidateRow = res.rows[0];
      }

      let currentStatus = candidateRow.status;
      if (currentStatus === 'COMPLETED') return { status: 'already_completed' };
      if (currentStatus === 'FAILED' && candidateRow.retry_count >= 3) return { status: 'already_failed' };

      // Helper to check if we should run a state
      const shouldRun = (stateName) => STATES[currentStatus] <= STATES[stateName];

      let mediaBuffer = null;
      let imageMeta = null;
      let sha256_hash = null;
      let phash = null;
      let b2Key = null;
      let mediaId = candidateRow.media_id;

      try {
        if (shouldRun('VALIDATING')) {
          await updateState(db, candidateId, 'VALIDATING');
          if (!payload.media_url) {
            await updateState(db, candidateId, 'FAILED', { error_reason: 'no_media_url' });
            return { status: 'skipped', reason: 'no_media_url' };
          }
          currentStatus = 'DOWNLOADING';
        }

        if (shouldRun('DOWNLOADING')) {
          await updateState(db, candidateId, 'DOWNLOADING');
          const dlResult = await downloadMedia(payload.media_url);
          mediaBuffer = dlResult.buffer;
          currentStatus = 'MEDIA_VALIDATED';
        }

        if (shouldRun('MEDIA_VALIDATED')) {
          await updateState(db, candidateId, 'MEDIA_VALIDATED');
          if (!mediaBuffer) {
             const dlResult = await downloadMedia(payload.media_url);
             mediaBuffer = dlResult.buffer;
          }
          imageMeta = await validateImage(mediaBuffer);
          currentStatus = 'HASHING';
        }

        if (shouldRun('HASHING')) {
          await updateState(db, candidateId, 'HASHING');
          if (!mediaBuffer) {
             const dlResult = await downloadMedia(payload.media_url);
             mediaBuffer = dlResult.buffer;
          }
          sha256_hash = calculateSha256(mediaBuffer);
          phash = await calculatePhash(mediaBuffer);
          currentStatus = 'DEDUPLICATING';
        } else {
           if (!mediaId) {
             const cr = await db.query('SELECT media_id FROM ingestion_candidates WHERE candidate_id = $1', [candidateId]);
             mediaId = cr.rows[0].media_id;
           }
        }

        if (shouldRun('DEDUPLICATING')) {
          await updateState(db, candidateId, 'DEDUPLICATING');
          
          const ext = imageMeta
  ? (imageMeta.format === 'jpeg' ? 'jpg' : imageMeta.format)
  : 'jpg';

const filename = generateFilename(
  payload.caption || payload.title || '',
  candidateId,
  ext,
  sha256_hash
);

const prospectiveB2Key =
  `${config.INGESTION_B2_KEY_PREFIX || 'ingestion/'}${filename}`;

          // Race-safe insertion
          let mediaRes = await db.query(
            `INSERT INTO ingestion_media (sha256_hash, phash, b2_key, format, width, height, file_size)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (sha256_hash) DO NOTHING RETURNING id, b2_key, embedding_status`,
            [sha256_hash, phash, prospectiveB2Key, imageMeta?.format, imageMeta?.width, imageMeta?.height, mediaBuffer?.byteLength]
          );

          let isDuplicate = false;
          if (mediaRes.rows.length === 0) {
             isDuplicate = true;
             mediaRes = await db.query('SELECT id, b2_key, embedding_status FROM ingestion_media WHERE sha256_hash = $1', [sha256_hash]);
          }

          mediaId = mediaRes.rows[0].id;
          b2Key = mediaRes.rows[0].b2_key;
          await updateState(db, candidateId, 'STORING', { media_id: mediaId });
          
          if (isDuplicate) {
             const eStatus = mediaRes.rows[0].embedding_status;
             if (eStatus === 'success') {
                currentStatus = 'COMPLETED';
             } else {
                currentStatus = 'OCR'; 
             }
          } else {
             currentStatus = 'STORING';
          }
        }

        if (shouldRun('STORING')) {
          await updateState(db, candidateId, 'STORING');
          
          if (!b2Key) {
             const mr = await db.query('SELECT b2_key FROM ingestion_media WHERE id = $1', [mediaId]);
             b2Key = mr.rows[0].b2_key;
          }
          if (!mediaBuffer) {
             const dlResult = await downloadMedia(payload.media_url);
             mediaBuffer = dlResult.buffer;
          }

          await uploadToB2(mediaBuffer, b2Key, imageMeta?.format ? `image/${imageMeta.format}` : 'image/jpeg');
          currentStatus = 'OCR';
        }

        if (shouldRun('OCR')) {
          await updateState(db, candidateId, 'OCR');
          if (!b2Key) {
             const mr = await db.query('SELECT b2_key FROM ingestion_media WHERE id = $1', [mediaId]);
             b2Key = mr.rows[0].b2_key;
          }
          
          const pythonRes = await indexMeme(b2Key, payload.caption || '');
          
          await db.query(
            'UPDATE ingestion_media SET ocr_status = $1, ocr_text = $2, embedding_status = $3, embedding_dimension = $4 WHERE id = $5',
            [
              pythonRes.ocr_status || 'success', 
              pythonRes.ocr_text || null, 
              pythonRes.embedding_status || 'success', 
              pythonRes.embedding_dimensions || 512, 
              mediaId
            ]
          );

          currentStatus = 'EMBEDDING';
        }

        if (shouldRun('EMBEDDING')) {
           // Both OCR and CLIP happen in one shot from indexMeme for MemeSearch, 
           // but we treat EMBEDDING as a separate conceptual phase here just to track it cleanly.
           await updateState(db, candidateId, 'EMBEDDING');
           currentStatus = 'COMPLETED';
        }

        if (shouldRun('COMPLETED')) {
          await updateState(db, candidateId, 'COMPLETED', { ingested_at: new Date().toISOString() });
        }

        return { status: 'completed', candidate_id: candidateId, media_id: mediaId };
      } catch (err) {
        const isTransient = err.isTransient !== undefined ? err.isTransient : true; 
        if (isTransient) {
          throw err; 
        } else {
          await updateState(db, candidateId, 'FAILED', { error_reason: err.message });
          return { status: 'failed', reason: err.message };
        }
      }
    }, {
      connection,
      concurrency
    });

    ingestionWorker.on('failed', async (job, err) => {
      try {
         const db = getDatabasePool();
         await db.query('UPDATE ingestion_candidates SET retry_count = retry_count + 1 WHERE candidate_id = $1', [job.data?.candidate_id]);
      } catch (e) {}
      logger.warn(`Worker failed attempt, will retry`, { jobId: job?.id || 'unknown', error: err.message });
    });

    logger.info(`BullMQ Worker initialized for ${queueName} with concurrency ${concurrency}`);
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
