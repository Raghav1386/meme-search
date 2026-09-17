import sharp from 'sharp';
import logger from '../utils/logger.js';

// Precompute DCT cosine tables for performance (32x32 matrix)
const cosines = new Float64Array(32 * 32);
for (let k = 0; k < 32; k++) {
  for (let n = 0; n < 32; n++) {
    cosines[k * 32 + n] = Math.cos((Math.PI / 32) * (n + 0.5) * k);
  }
}

const alpha = new Float64Array(32);
alpha[0] = 1.0 / Math.sqrt(32);
for (let i = 1; i < 32; i++) {
  alpha[i] = Math.sqrt(2.0 / 32.0);
}

/**
 * Calculates a TRUE Perceptual Hash (pHash) for an image buffer using 2D DCT.
 * It resizes the image to 32x32, converts to grayscale, computes the DCT, 
 * extracts the top-left 8x8 low-frequency region, and calculates a 64-bit hash based on the median.
 * 
 * @param {Buffer} buffer - The raw image bytes.
 * @returns {Promise<Object>} - The deterministic perceptual hash result.
 */
export async function calculatePhash(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Input must be a Buffer');
  }

  try {
    // 1. Normalize image (32x32, grayscale)
    const { data } = await sharp(buffer)
      .resize(32, 32, { fit: 'fill' }) // 32 columns, 32 rows
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
      
    // 2. Compute 2D DCT (only for top-left 8x8 block out of 32x32 image)
    const dct8x8 = new Float64Array(64);

    for (let u = 0; u < 8; u++) {
      for (let v = 0; v < 8; v++) {
        let sum = 0.0;
        for (let x = 0; x < 32; x++) {
          for (let y = 0; y < 32; y++) {
            const pixel = data[y * 32 + x];
            sum += pixel * cosines[u * 32 + x] * cosines[v * 32 + y];
          }
        }
        dct8x8[u * 8 + v] = sum * alpha[u] * alpha[v];
      }
    }

    // 3. Select low-frequency coefficients and calculate mean (excluding DC [0,0])
    let sumAC = 0;
    for (let i = 1; i < 64; i++) {
      sumAC += dct8x8[i];
    }
    const mean = sumAC / 63;

    // 4. Generate 64-bit binary hash based on comparison against mean
    let binaryString = '';
    for (let i = 0; i < 64; i++) {
      binaryString += (dct8x8[i] > mean) ? '1' : '0';
    }
    
    // 5. Convert 64-bit binary string to 16-character hex string safely
    let hexString = '';
    for (let i = 0; i < 64; i += 4) {
      const nibble = binaryString.substring(i, i + 4);
      hexString += parseInt(nibble, 2).toString(16);
    }
    
    return {
      algorithm: 'phash-dct',
      hash: hexString.padStart(16, '0') // Ensure exactly 16 chars
    };
  } catch (err) {
    logger.warn('Failed to calculate TRUE pHash', { error: err.message });
    throw err;
  }
}
