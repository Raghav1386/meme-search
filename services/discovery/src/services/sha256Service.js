import crypto from 'crypto';

/**
 * Calculates the exact SHA-256 hash of a Buffer.
 *
 * @param {Buffer} buffer - The raw media bytes.
 * @returns {Object} - The deterministic hash result.
 */
export function calculateHash(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Input must be a Buffer');
  }
  
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  
  return {
    algorithm: 'sha256',
    hash: hash.toLowerCase()
  };
}
