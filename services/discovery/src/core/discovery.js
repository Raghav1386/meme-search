import crypto from 'crypto';
import logger from '../utils/logger.js';
import { executeSources } from '../sources/index.js';
import { normalizeCandidate } from '../services/candidateNormalizer.js';
import { validateCandidate } from '../services/candidateValidator.js';
import { enqueueCandidate } from '../queue/producer.js';
import { scoreCandidate } from '../services/trendScorer.js';
import { rankCandidates } from '../services/candidateRanker.js';
import { filterCandidate } from '../services/candidateFilter.js';
import { Candidate } from '../../../shared/models/Candidate.js';
import { getDatabasePool } from '../database/index.js';
import config from '../config/index.js';

export async function runDiscovery() {
  if (!config.DISCOVERY_ENABLED) {
    logger.info('Discovery run skipped: DISCOVERY_ENABLED is false');
    return { status: 'skipped' };
  }

  const discoveryRunId = crypto.randomUUID();
  logger.info('Discovery Run Started', { discovery_run_id: discoveryRunId });

  let results = {
    discovery_run_id: discoveryRunId,
    sources_configured: 0,
    sources_executed: 0,
    sources_skipped: 0,
    sources_failed: 0,
    candidates_received: 0,
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
    status: 'completed',
    error: null
  };

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

  try {
    // 1. SOURCE EXECUTION
    const rawCandidates = await executeSources(discoveryRunId);
    
    // Unpack source execution metrics
    const metrics = rawCandidates._sourceMetrics || {};
    results.sources_configured = (metrics.executed || 0) + (metrics.skipped || 0) + (metrics.failed || 0);
    results.sources_executed = metrics.executed || 0;
    results.sources_skipped = metrics.skipped || 0;
    results.sources_failed = metrics.failed || 0;
    
    results.candidates_received = rawCandidates.length;
    logger.info(`Raw candidates received`, { discovery_run_id: discoveryRunId, candidates_received: rawCandidates.length });

    // 2. NORMALIZATION & VALIDATION & IDENTITY DEDUPLICATION
    const acceptedCandidates = [];
    const seenInRun = new Set();
    
    for (const raw of rawCandidates) {
      try {
        // Normalize
        const normalized = normalizeCandidate(raw);
        results.candidates_normalized++;

        // Validate
        const validation = validateCandidate(normalized);
        
        if (!validation.valid) {
          logger.warn('Candidate validation failed', { 
            discovery_run_id: discoveryRunId, 
            candidate_id: normalized.candidate_id || 'unknown',
            errors: validation.errors
          });
          results.candidates_rejected++;
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

    // 3. TREND PROCESSING (Phase 3.5.1)
    for (const candidate of acceptedCandidates) {
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
        // Safe isolation: do not crash Discovery or drop candidate if scoring fails
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
      rankedCandidates = rankCandidates(acceptedCandidates);
      results.ranked = rankedCandidates.length;
      
      // Log the ranking aggregate success
      if (results.ranked > 0) {
        logger.info('Candidates successfully ranked', {
          discovery_run_id: discoveryRunId,
          count: results.ranked
        });
      }
    } catch (err) {
      results.ranking_failed = acceptedCandidates.length;
      logger.error('Ranking failed abruptly', { discovery_run_id: discoveryRunId, error: err.message });
      // If ranking catastrophically fails, we must NOT queue unranked candidates
      throw new Error('Ranking boundary failed: ' + err.message);
    }

    let filterPassed = [];
    for (const candidate of rankedCandidates) {
      try {
        const filterResult = filterCandidate(candidate);
        if (filterResult.passed) {
          filterPassed.push(candidate);
        } else {
          results.filtered++;
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

    // TOP-N LIMIT
    const finalQueueCandidates = [];
    for (let i = 0; i < filterPassed.length; i++) {
      if (i < config.TREND_MAX_CANDIDATES_PER_RUN) {
        finalQueueCandidates.push(filterPassed[i]);
      } else {
        results.limit_excluded++;
      }
    }

    if (results.limit_excluded > 0) {
      logger.info('Candidates excluded by run limit', {
        discovery_run_id: discoveryRunId,
        limit: config.TREND_MAX_CANDIDATES_PER_RUN,
        excluded_count: results.limit_excluded
      });
    }

    // 5. QUEUING (Phase 3.4 boundary integration)
    for (const candidate of finalQueueCandidates) {
      const enqueueResult = await enqueueCandidate(candidate, discoveryRunId);
      
      if (enqueueResult.status === 'queued') {
         results.candidates_queued++;
      } else if (enqueueResult.status === 'existing') {
         results.candidates_already_queued++;
      } else {
         results.candidates_queue_failed++;
      }
    }

    logger.info('Discovery Run Completed', { 
      discovery_run_id: discoveryRunId, 
      sources_configured: results.sources_configured,
      sources_executed: results.sources_executed,
      sources_skipped: results.sources_skipped,
      sources_failed: results.sources_failed,
      received: results.candidates_received,
      normalized: results.candidates_normalized,
      accepted: results.candidates_accepted,
      duplicates: results.candidates_duplicates,
      scored: results.candidates_scored,
      score_failed: results.candidates_score_failed,
      ranked: results.ranked,
      filtered: results.filtered,
      filter_failed: results.filter_failed,
      ranking_failed: results.ranking_failed,
      limit_excluded: results.limit_excluded,
      queued: results.candidates_queued,
      already_queued: results.candidates_already_queued,
      queue_failed: results.candidates_queue_failed,
      rejected: results.candidates_rejected
    });

    if (db) {
      try {
        await db.query(
          'UPDATE discovery_runs SET status = $1, completed_at = CURRENT_TIMESTAMP, metrics_json = $2 WHERE id = $3',
          ['completed', JSON.stringify(results), discoveryRunId]
        );

        // Batch insert/upsert candidates
        for (const candidate of acceptedCandidates) {
           let dbStatus = 'rejected';
           if (finalQueueCandidates.includes(candidate)) {
              dbStatus = 'queued';
           } else if (filterPassed.includes(candidate)) {
              dbStatus = 'excluded_by_limit';
           }

           const trendScore = candidate.trend_score || 0;
           await db.query(`
             INSERT INTO discovery_candidates 
             (id, run_id, platform, platform_content_id, metadata_json, trend_score, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (platform, platform_content_id) DO UPDATE SET 
             run_id = EXCLUDED.run_id,
             metadata_json = EXCLUDED.metadata_json,
             trend_score = EXCLUDED.trend_score,
             status = EXCLUDED.status,
             updated_at = CURRENT_TIMESTAMP
           `, [
             candidate.candidate_id,
             discoveryRunId,
             candidate.platform,
             candidate.platform_content_id,
             JSON.stringify(candidate.metadata),
             trendScore,
             dbStatus
           ]);
        }
      } catch (dbErr) {
        logger.warn('Failed to update discovery run or candidates in DB', { error: dbErr.message });
      }
    }

  } catch (err) {
    logger.error('Discovery Run failed with fatal error', { discovery_run_id: discoveryRunId, error: err.message });
    results.status = 'failed';
    results.error = err.message;
    
    if (db) {
       await db.query(
          'UPDATE discovery_runs SET status = $1, completed_at = CURRENT_TIMESTAMP, metrics_json = $2 WHERE id = $3',
          ['failed', JSON.stringify(results), discoveryRunId]
       ).catch(() => {});
    }
  }

  return results;
}
