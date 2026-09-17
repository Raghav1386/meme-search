import crypto from 'crypto';
import sharp from 'sharp';
import logger from './logger.js';

/**
 * Calculates the SHA-256 hash of a buffer.
 * @param {Buffer} buffer - The image/media buffer
 * @returns {string} 64-character hex string
 */
export function calculateSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Calculates a 64-bit perceptual hash (dHash) using Sharp.
 * Resizes the image to 9x8, converts to grayscale, and compares adjacent pixels.
 * @param {Buffer} buffer - The image buffer
 * @returns {Promise<string|null>} 16-character hex string representing the 64-bit pHash
 */
export async function calculatePhash(buffer) {
  try {
    const { data, info } = await sharp(buffer)
      .greyscale()
      .resize(9, 8, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let hashValue = 0n;
    let bitIndex = 0n;

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const leftPixel = data[y * 9 + x];
        const rightPixel = data[y * 9 + x + 1];
        
        if (leftPixel > rightPixel) {
          hashValue |= (1n << bitIndex);
        }
        bitIndex++;
      }
    }

    // Return as a 16-character hex string (zero padded)
    return hashValue.toString(16).padStart(16, '0');
  } catch (err) {
    logger.warn('Failed to calculate pHash, returning null', { error: err.message });
    return null;
  }
}

/**
 * Calculates the Hamming distance between two 16-char hex pHashes.
 * @param {string} hash1
 * @param {string} hash2
 * @returns {number} The hamming distance (0-64)
 */
export function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== 16 || hash2.length !== 16) {
    return 64; // Maximum distance if invalid
  }
  
  const h1 = BigInt(`0x${hash1}`);
  const h2 = BigInt(`0x${hash2}`);
  
  let xor = h1 ^ h2;
  let dist = 0;
  
  while (xor > 0n) {
    dist += Number(xor & 1n);
    xor >>= 1n;
  }
  
  return dist;
}
