import { getDatabasePool } from '../database/index.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const FALLBACK_QUERIES = ['meme', 'funny', 'hilarious'];

export async function generateSearchQueries(topics = []) {
  const db = getDatabasePool();
  let selectedQueries = [];

  try {
    // Avoid querying the exact same thing if we searched it recently (12 hours)
    let recentlyUsed = new Set();
    if (db) {
      const res = await db.query(`
        SELECT query FROM discovery_queries 
        WHERE last_used_at >= NOW() - INTERVAL '12 HOURS'
      `);
      recentlyUsed = new Set(res.rows.map(r => r.query));
    }

    for (const t of topics) {
      if (selectedQueries.length >= config.DISCOVERY_MAX_DYNAMIC_QUERIES_PER_RUN) break;
      
      const q = t.topic.toLowerCase();
      if (!recentlyUsed.has(q) && !selectedQueries.includes(q)) {
        selectedQueries.push(q);
      } else {
        logger.info('SearchQueryGenerator: Skipped duplicate/recent query', { query: q });
      }
    }
  } catch (err) {
    logger.error('SearchQueryGenerator: Failed to generate dynamic queries, using fallback', { error: err.message });
  }

  // Fallback if we didn't get enough or any
  if (selectedQueries.length === 0) {
    selectedQueries = [FALLBACK_QUERIES[Math.floor(Math.random() * FALLBACK_QUERIES.length)]];
    logger.info('SearchQueryGenerator: Using fallback query', { query: selectedQueries[0] });
  }

  logger.info('SearchQueryGenerator: Generated queries', { count: selectedQueries.length, queries: selectedQueries });

  // Update DB for the queries we are about to use
  if (db) {
    for (const q of selectedQueries) {
      try {
         await db.query(`
           INSERT INTO discovery_queries (query, last_used_at, use_count)
           VALUES ($1, CURRENT_TIMESTAMP, 1)
           ON CONFLICT (query) DO UPDATE SET
           last_used_at = CURRENT_TIMESTAMP,
           use_count = discovery_queries.use_count + 1
         `, [q]);
      } catch (dbErr) {
         logger.warn('SearchQueryGenerator: Failed to record query usage', { query: q, error: dbErr.message });
      }
    }
  }

  return selectedQueries;
}

export async function recordQueryPerformance(queries, returned, accepted, rejected) {
  const db = getDatabasePool();
  if (!db || !queries || queries.length === 0) return;
  
  // Since multiple queries are executed in one Apify run, we distribute the metrics evenly
  const qCount = queries.length;
  
  try {
     await db.query(`
       UPDATE discovery_queries 
       SET total_candidates_returned = total_candidates_returned + $1,
           total_candidates_accepted = total_candidates_accepted + $2,
           total_candidates_rejected = total_candidates_rejected + $3
       WHERE query = ANY($4)
     `, [
       Math.floor(returned / qCount), 
       Math.floor(accepted / qCount), 
       Math.floor(rejected / qCount), 
       queries
     ]);
  } catch (err) {
     logger.warn('SearchQueryGenerator: Failed to update query performance metrics', { error: err.message });
  }
}
