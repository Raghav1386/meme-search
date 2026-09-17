import crypto from 'crypto';
import logger from '../utils/logger.js';
import { executeSources } from '../sources/index.js';
import { normalizeCandidate } from '../services/candidateNormalizer.js';
import { validateCandidate } from '../services/candidateValidator.js';
import { enqueueCandidate } from '../queue/producer.js';
import { scoreCandidate } from '../services/trendScorer.js';
import { rankCandidates } from '../services/candidateRanker.js';
import { filterCandidate } from '../services/candidateFilter.js';
import { filterRedditCandidate } from '../services/redditQualityFilter.js';
import { fetchMediaBytes } from '../services/mediaAcquisition.js';
import { calculateHash } from '../services/sha256Service.js';
import { checkDuplicate } from '../services/duplicateDetector.js';
import { calculatePhash } from '../services/phashService.js';
import { checkPhashDuplicate } from '../services/phashDuplicateDetector.js';
import { extractAndScoreTopics } from '../services/trendingTopicService.js';
import { generateSearchQueries, recordQueryPerformance } from '../services/searchQueryGenerator.js';
import { Candidate } from '../../../shared/models/Candidate.js';
import { getDatabasePool } from '../database/index.js';
import config from '../config/index.js';

export async function processCandidatesPipeline(rawCandidates, discoveryRunId, baseResults = {}, options = {}) {
  const { skipNormalization = false } = options;
  const db = getDatabasePool();

  let results = {
    discovery_run_id: discoveryRunId,
    sources_configured: baseResults.sources_configured || 0,
    sources_executed: baseResults.sources_executed || 0,
    sources_skipped: baseResults.sources_skipped || 0,
    sources_failed: baseResults.sources_failed || 0,
    candidates_received: rawCandidates.length,
    candidates_normalized: 0,
    candidates_accepted: 0,
    candidates_rejected: 0,
    candidates_duplicates: 0,
    candidates_scored: 0,
    candidates_score_failed: 0,
    ranked: 0,
    filtered: 0,
    filter_failed: 0,
    ranking_failed: 0,
    limit_excluded: 0,
    candidates_queued: 0,
    candidates_already_queued: 0,
    candidates_queue_failed: 0,
    reddit_quality_rejected: 0,
    reddit_video_rejected: 0,
    reddit_audio_rejected: 0,
    reddit_text_rejected: 0,
    reddit_image_candidates: 0,
    status: 'completed',
    error: null,
    rejection_breakdown: {}
  };

  logger.info(`Raw candidates received`, { discovery_run_id: discoveryRunId, candidates_received: rawCandidates.length });

  // 2. NORMALIZATION & VALIDATION & IDENTITY DEDUPLICATION
  const acceptedCandidates = [];
  const seenInRun = new Set();
  
  for (const raw of rawCandidates) {
    try {
      // Normalize
      const normalized = skipNormalization ? raw : normalizeCandidate(raw);
      if (!skipNormalization) results.candidates_normalized++;

      // Validate
      const validation = validateCandidate(normalized);
      
      if (!validation.valid) {
        logger.warn('Candidate validation failed', { 
          discovery_run_id: discoveryRunId, 
          candidate_id: normalized.candidate_id || 'unknown',
          errors: validation.errors
        });
        results.candidates_rejected++;
        results.rejection_breakdown['validation_failed'] = (results.rejection_breakdown['validation_failed'] || 0) + 1;
        continue;
      }

      if (validation.warnings.length > 0) {
         logger.info('Candidate validation warnings', {
           discovery_run_id: discoveryRunId,
           candidate_id: normalized.candidate_id,
           warnings: validation.warnings
         });
      }

      // Deduplication (Run Level)
      if (seenInRun.has(normalized.candidate_id)) {
         logger.info('Candidate deduplicated (already seen in this run)', {
           discovery_run_id: discoveryRunId,
           candidate_id: normalized.candidate_id
         });
         results.candidates_duplicates++;
         continue;
      }
      
      seenInRun.add(normalized.candidate_id);

      logger.info('Candidate validation passed', {
        discovery_run_id: discoveryRunId,
        candidate_id: normalized.candidate_id,
        platform: normalized.platform
      });

      // Ensure constructor succeeds
      const finalCandidate = new Candidate(normalized);
      acceptedCandidates.push(finalCandidate);
      results.candidates_accepted++;
      
    } catch (err) {
      // Ensure isolation: a failed normalization/validation must not crash the run
      logger.error('Candidate processing failed abruptly', {
         discovery_run_id: discoveryRunId,
         error: err.message
      });
      results.candidates_rejected++;
    }
  }

  // 2.5 CROSS-RUN DEDUPLICATION (Phase 5)
  const freshCandidates = [];
  
  if (db && acceptedCandidates.length > 0) {
    try {
      const platformIds = acceptedCandidates.map(c => c.platform_content_id);
      const res = await db.query(
        `SELECT platform_content_id FROM discovery_candidates 
         WHERE platform_content_id = ANY($1) 
         AND status IN ('queued', 'processing', 'ingested', 'embedded', 'success')`,
        [platformIds]
      );
      
      const knownIds = new Set(res.rows.map(r => r.platform_content_id));
      
      for (const candidate of acceptedCandidates) {
        if (knownIds.has(candidate.platform_content_id)) {
          logger.info('Candidate deduplicated (cross-run persistent)', {
             discovery_run_id: discoveryRunId,
             candidate_id: candidate.candidate_id
          });
          results.candidates_duplicates++;
        } else {
          freshCandidates.push(candidate);
        }
      }
    } catch (err) {
      logger.warn('Cross-run deduplication query failed, proceeding without it', { error: err.message });
      freshCandidates.push(...acceptedCandidates);
    }
  }

  // 2.75 REDDIT QUALITY FILTERING (Phase 2A)
  const qualityFilteredCandidates = [];
  
  for (const candidate of freshCandidates) {
    if (candidate.platform === 'reddit') {
      try {
        const qualityResult = filterRedditCandidate(candidate);
        if (qualityResult.accepted) {
          qualityFilteredCandidates.push(candidate);
        } else {
          results.reddit_quality_rejected++;
          results.filtered++;
          
          results.rejection_breakdown[qualityResult.reason] = (results.rejection_breakdown[qualityResult.reason] || 0) + 1;
          
          if (qualityResult.reason === 'reddit_text_only') results.reddit_text_rejected++;
          else if (qualityResult.reason === 'reddit_unsupported_media') {
            const mediaType = candidate.metadata?.media_type;
            if (mediaType === 'video') results.reddit_video_rejected++;
            else if (mediaType === 'audio') results.reddit_audio_rejected++;
          }
          
          logger.info('Reddit candidate filtered', {
            discovery_run_id: discoveryRunId,
            candidate_id: candidate.candidate_id,
            reason: qualityResult.reason,
            age_hours: qualityResult.age_hours !== undefined ? qualityResult.age_hours : null,
            upvotes: qualityResult.upvotes !== undefined ? qualityResult.upvotes : null,
            comments: qualityResult.comments !== undefined ? qualityResult.comments : null,
            minimum: qualityResult.minimum !== undefined ? qualityResult.minimum : null
          });
        }
      } catch (err) {
         results.filter_failed++;
         logger.error('Reddit quality filtering failed abruptly', {
            discovery_run_id: discoveryRunId,
            candidate_id: candidate.candidate_id,
            error: err.message
         });
      }
    } else {
      qualityFilteredCandidates.push(candidate);
    }
  }

  // 3. TREND PROCESSING (Phase 3.5.1)
  for (const candidate of qualityFilteredCandidates) {
    try {
      const scoreResult = scoreCandidate(candidate);
      candidate.trend_score = scoreResult.trend_score;
      candidate.score_breakdown = scoreResult.components;
      results.candidates_scored++;
      
      logger.info('Candidate scored', {
        discovery_run_id: discoveryRunId,
        candidate_id: candidate.candidate_id,
        trend_score: candidate.trend_score
      });
    } catch (err) {
      results.candidates_score_failed++;
      logger.error('Candidate scoring failed', {
        discovery_run_id: discoveryRunId,
        candidate_id: candidate.candidate_id,
        error: err.message
      });
    }
  }

  // 4. RANKING & FILTERING (Phase 3.5.2)
  let rankedCandidates = [];
  try {
    rankedCandidates = rankCandidates(qualityFilteredCandidates);
    results.ranked = rankedCandidates.length;
    
    if (results.ranked > 0) {
      logger.info('Candidates successfully ranked', {
        discovery_run_id: discoveryRunId,
        count: results.ranked
      });
    }
  } catch (err) {
    results.ranking_failed = freshCandidates.length;
    logger.error('Ranking failed abruptly', { discovery_run_id: discoveryRunId, error: err.message });
    throw new Error('Ranking boundary failed: ' + err.message);
  }

  let filterPassed = [];
  for (const candidate of rankedCandidates) {
    try {
      const filterResult = filterCandidate(candidate);
      if (filterResult.accepted) {
        
        // PHASE 3.4B: Exact Duplicate Detection
        if (candidate.media_url) {
           try {
              const buffer = await fetchMediaBytes(candidate.media_url);
              const hashResult = calculateHash(buffer);
              const duplicateResult = await checkDuplicate(hashResult.hash);
              
              if (duplicateResult.duplicate) {
                 results.candidates_duplicates_sha256 = (results.candidates_duplicates_sha256 || 0) + 1;
                 results.rejection_breakdown['duplicate_sha256'] = (results.rejection_breakdown['duplicate_sha256'] || 0) + 1;
                 logger.info('Candidate rejected: exact duplicate', {
                    discovery_run_id: discoveryRunId,
                    candidate_id: candidate.candidate_id,
                    sha256_hash: duplicateResult.sha256_hash,
                    existing_id: duplicateResult.existing_candidate_id
                 });
                 continue; // Drop the candidate
              }
              
              candidate.sha256_hash = duplicateResult.sha256_hash;

              // PHASE 3.4C: Perceptual Duplicate Detection (pHash)
              const phashResult = await calculatePhash(buffer);
              const pDuplicateResult = await checkPhashDuplicate(phashResult.hash);
              
              if (pDuplicateResult.duplicate) {
                 results.candidates_duplicates_phash = (results.candidates_duplicates_phash || 0) + 1;
                 results.rejection_breakdown['duplicate_phash'] = (results.rejection_breakdown['duplicate_phash'] || 0) + 1;
                 logger.info('Candidate rejected: perceptual duplicate', {
                    discovery_run_id: discoveryRunId,
                    candidate_id: candidate.candidate_id,
                    phash: pDuplicateResult.phash,
                    distance: pDuplicateResult.distance,
                    threshold: pDuplicateResult.threshold,
                    existing_id: pDuplicateResult.matched_candidate_id
                 });
                 continue; // Drop the candidate
              }
              
              candidate.phash = phashResult.hash;

           } catch (err) {
              logger.warn('Failed to perform duplicate detection, allowing candidate', { 
                error: err.message, 
                candidate_id: candidate.candidate_id 
              });
           }
        }

        filterPassed.push(candidate);
      } else {
        results.filtered++;
        results.rejection_breakdown[filterResult.reason] = (results.rejection_breakdown[filterResult.reason] || 0) + 1;
        
        if (filterResult.reason === 'media_type_video') results.reddit_video_rejected++;
        else if (filterResult.reason === 'media_type_audio') results.reddit_audio_rejected++;
        else if (filterResult.reason === 'media_type_text') results.reddit_text_rejected++;

        logger.info('Candidate filtered', {
          discovery_run_id: discoveryRunId,
          candidate_id: candidate.candidate_id,
          trend_score: candidate.trend_score,
          filter_reason: filterResult.reason
        });
      }
    } catch (err) {
      results.filter_failed++;
      logger.error('Candidate filtering failed abruptly', {
        discovery_run_id: discoveryRunId,
        candidate_id: candidate.candidate_id,
        error: err.message
      });
    }
  }

  // TOP-N LIMIT (REMOVED)
  // We no longer arbitrarily cap the queue. We queue all eligible candidates.
  const finalQueueCandidates = [...filterPassed];
  const mandatory_valid = filterPassed.length;
  const minimum_acceptance_target = Math.ceil(mandatory_valid * (config.DISCOVERY_MIN_ACCEPTANCE_RATE || 0.70));
  
  // Set limit_excluded to 0 since we removed the cap.
  results.limit_excluded = 0;

  // 5. QUEUING (Phase 3.4 boundary integration)
  for (const candidate of finalQueueCandidates) {
    const enqueueResult = await enqueueCandidate(candidate, discoveryRunId);
    
    candidate.queue_status = enqueueResult.status;
    
    if (enqueueResult.status === 'queued') {
       results.candidates_queued++;
       if (candidate.platform === 'reddit') {
          results.reddit_image_candidates++;
       }
    } else if (enqueueResult.status === 'existing') {
       results.candidates_already_queued++;
    } else {
       results.candidates_queue_failed++;
    }
  }

  // Calculate acceptance rate
  const acceptance_rate = mandatory_valid > 0 ? (results.candidates_queued / mandatory_valid) : 0;
  
  // Append new metrics to results for database metrics_json
  results.mandatory_valid = mandatory_valid;
  results.minimum_acceptance_target = minimum_acceptance_target;
  results.acceptance_rate = acceptance_rate;

  logger.info('Discovery Run Completed', { 
    discovery_run_id: discoveryRunId, 
    sources_configured: results.sources_configured,
    sources_executed: results.sources_executed,
    sources_skipped: results.sources_skipped,
    sources_failed: results.sources_failed,
    received: results.candidates_received,
    normalized: results.candidates_normalized,
    mandatory_valid: results.mandatory_valid,
    minimum_acceptance_target: results.minimum_acceptance_target,
    accepted: results.candidates_accepted,
    duplicates: results.candidates_duplicates,
    scored: results.candidates_scored,
    score_failed: results.candidates_score_failed,
    ranked: results.ranked,
    filtered: results.filtered,
    filter_failed: results.filter_failed,
    ranking_failed: results.ranking_failed,
    queued: results.candidates_queued,
    acceptance_rate: `${(results.acceptance_rate * 100).toFixed(1)}%`,
    already_queued: results.candidates_already_queued,
    queue_failed: results.candidates_queue_failed,
    rejected: results.candidates_rejected,
    reddit_quality_rejected: results.reddit_quality_rejected,
    reddit_audio_rejected: results.reddit_audio_rejected,
    reddit_text_rejected: results.reddit_text_rejected,
    reddit_image_candidates: results.reddit_image_candidates,
    source_status: baseResults.source_status || {},
    rejection_breakdown: results.rejection_breakdown
  });

  if (db) {
    try {
      await db.query(
        'UPDATE discovery_runs SET status = $1, completed_at = CURRENT_TIMESTAMP, metrics_json = $2 WHERE id = $3',
        ['completed', JSON.stringify(results), discoveryRunId]
      );

      for (const candidate of acceptedCandidates) {
         let dbStatus = 'rejected';
         if (finalQueueCandidates.includes(candidate)) {
            if (candidate.queue_status === 'queued') {
               dbStatus = 'queued';
            } else if (candidate.queue_status === 'existing') {
               dbStatus = 'already_queued';
            } else {
               dbStatus = 'queue_failed';
            }
         } else if (filterPassed.includes(candidate)) {
            dbStatus = 'excluded_by_limit';
         }

         const trendScore = candidate.trend_score || 0;
         try {
            await db.query(`
              INSERT INTO discovery_candidates 
              (id, run_id, platform, platform_content_id, metadata_json, trend_score, status, sha256_hash, phash)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              ON CONFLICT (platform, platform_content_id) DO UPDATE SET 
              run_id = EXCLUDED.run_id,
              metadata_json = EXCLUDED.metadata_json,
              trend_score = EXCLUDED.trend_score,
              sha256_hash = COALESCE(discovery_candidates.sha256_hash, EXCLUDED.sha256_hash),
              phash = COALESCE(discovery_candidates.phash, EXCLUDED.phash),
              status = CASE 
                         WHEN discovery_candidates.status IN ('queued', 'processing', 'ingested', 'embedded', 'success') THEN discovery_candidates.status 
                         ELSE EXCLUDED.status 
                       END,
              updated_at = CURRENT_TIMESTAMP,
              last_seen_at = CURRENT_TIMESTAMP
            `, [
              candidate.candidate_id,
              discoveryRunId,
              candidate.platform,
              candidate.platform_content_id,
              JSON.stringify(candidate.metadata),
              trendScore,
              dbStatus,
              candidate.sha256_hash || null,
              candidate.phash || null
            ]);
         } catch (dbInsertErr) {
            if (dbInsertErr.code === '23505' && dbInsertErr.constraint === 'unique_sha256_hash') {
               logger.info('Candidate rejected at DB insertion: exact duplicate (race condition prevented)', {
                  discovery_run_id: discoveryRunId,
                  candidate_id: candidate.candidate_id,
                  sha256_hash: candidate.sha256_hash
               });
            } else {
               logger.warn('Failed to insert/update discovery_candidate in DB', { 
                  error: dbInsertErr.message, 
                  candidate_id: candidate.candidate_id 
               });
            }
         }
      }
    } catch (dbErr) {
      logger.warn('Failed to update discovery run in DB', { error: dbErr.message });
    }
  }

  return results;
}

export async function runDiscovery(providedRunId, options = {}) {
  if (!config.DISCOVERY_ENABLED) {
    logger.info('Discovery run skipped: DISCOVERY_ENABLED is false');
    return { status: 'skipped' };
  }

  const defaultRunId = `discovery-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
  const discoveryRunId = providedRunId || defaultRunId;
  
  logger.info('Discovery Run Started', { discovery_run_id: discoveryRunId });

  const db = getDatabasePool();
  if (db) {
    try {
      await db.query(
        'INSERT INTO discovery_runs (id, status) VALUES ($1, $2)',
        [discoveryRunId, 'running']
      );
    } catch (dbErr) {
      logger.warn('Failed to insert discovery_run record', { error: dbErr.message });
    }
  }

  let baseResults = {};
  let rawCandidates = [];

  try {
    // Phase 2B: Dynamic Topic Discovery (Only if manual queries aren't provided)
    if (!options.query && (!options.queries || options.queries.length === 0)) {
       logger.info('Discovery Run: Starting dynamic topic discovery', { discovery_run_id: discoveryRunId });
       const topics = await extractAndScoreTopics();
       const dynamicQueries = await generateSearchQueries(topics);
       options.queries = dynamicQueries;
    }

    rawCandidates = await executeSources(discoveryRunId, options);
    
    const metrics = rawCandidates._sourceMetrics || {};
    baseResults.sources_configured = (metrics.executed || 0) + (metrics.skipped || 0) + (metrics.failed || 0);
    baseResults.sources_executed = metrics.executed || 0;
    baseResults.sources_skipped = metrics.skipped || 0;
    baseResults.sources_failed = metrics.failed || 0;
    baseResults.source_status = metrics.details || {};
    
    const pipelineResults = await processCandidatesPipeline(rawCandidates, discoveryRunId, baseResults, { skipNormalization: false });

    // Include the detailed source statuses in the final response
    pipelineResults.source_status = baseResults.source_status;

    // Update Phase 2B Query Performance Metrics
    const queriesUsed = options.queries || (options.query ? [options.query] : []);
    if (queriesUsed.length > 0) {
      await recordQueryPerformance(
         queriesUsed, 
         pipelineResults.candidates_received, 
         pipelineResults.candidates_accepted, 
         pipelineResults.candidates_rejected
      );
    }

    return pipelineResults;
  } catch (err) {
    logger.error('Discovery Run failed with fatal error', { discovery_run_id: discoveryRunId, error: err.message });
    
    const failedResults = {
       status: 'failed',
       error: err.message
    };
    
    if (db) {
       await db.query(
          'UPDATE discovery_runs SET status = $1, completed_at = CURRENT_TIMESTAMP, metrics_json = $2 WHERE id = $3',
          ['failed', JSON.stringify(failedResults), discoveryRunId]
       ).catch(() => {});
    }
    
    return failedResults;
  }
}

