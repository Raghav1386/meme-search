import { getDatabasePool } from '../database/index.js';
import logger from '../utils/logger.js';

/**
 * Checks the database to see if this SHA-256 hash already exists.
 *
 * @param {string} sha256Hash - The 64-character lowercase hex hash.
 * @returns {Promise<Object>} - Duplicate lookup result.
 */
export async function checkDuplicate(sha256Hash) {
  if (!sha256Hash || typeof sha256Hash !== 'string' || sha256Hash.length !== 64) {
    throw new Error('Valid sha256Hash is required');
  }

  const db = getDatabasePool();
  if (!db) {
    logger.warn('duplicateDetector: Database disabled, assuming candidate is unique', { sha256_hash: sha256Hash });
    return {
      duplicate: false,
      reason: 'database_unavailable',
      sha256_hash: sha256Hash
    };
  }

  try {
    const res = await db.query(
      `SELECT id FROM discovery_candidates WHERE sha256_hash = $1 LIMIT 1`,
      [sha256Hash]
    );

    if (res.rows.length > 0) {
      return {
        duplicate: true,
        reason: 'sha256_exact_match',
        sha256_hash: sha256Hash,
        existing_candidate_id: res.rows[0].id
      };
    }

    return {
      duplicate: false,
      reason: 'sha256_unique',
      sha256_hash: sha256Hash
    };

  } catch (err) {
    logger.error('Failed to query exact duplicate', { error: err.message, sha256_hash: sha256Hash });
    return {
      duplicate: false,
      reason: 'database_error',
      sha256_hash: sha256Hash
    };
  }
}
