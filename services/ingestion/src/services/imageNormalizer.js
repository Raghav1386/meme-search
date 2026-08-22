import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import sharp from 'sharp';
import config from '../config/index.js';
import logger from '../utils/logger.js';

export class NormalizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NormalizationError';
  }
}

export class InputValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputValidationError';
  }
}

export async function normalizeImage(inputPath) {
  const startTime = Date.now();

  // 1. Input Validation
  if (!inputPath || typeof inputPath !== 'string') {
    throw new InputValidationError('Missing or invalid input path');
  }

  const resolvedInput = path.resolve(inputPath);
  const tmpDir = path.resolve(os.tmpdir());

  if (!resolvedInput.startsWith(tmpDir)) {
    throw new InputValidationError('Input path must reside within the approved temporary directory');
  }

  let stats;
  try {
    stats = await fs.stat(resolvedInput);
  } catch (err) {
    if (err.code === 'ENOENT') throw new InputValidationError('Input file does not exist');
    throw err;
  }

  if (!stats.isFile()) {
    throw new InputValidationError('Input path is not a regular file');
  }

  if (stats.size > config.MEDIA_MAX_BYTES) {
    throw new NormalizationError(`Input file exceeds maximum allowed size of ${config.MEDIA_MAX_BYTES} bytes`);
  }

  // 2. Prepare Atomic Output Path
  const fileId = crypto.randomBytes(16).toString('hex');
  const finalOutputPath = path.join(tmpDir, `meme_norm_${fileId}.jpeg`);
  const tmpOutputPath = path.join(tmpDir, `meme_norm_${fileId}.jpeg.tmp`);

  let pipeline;
  let metadata;

  try {
    // We intentionally omit `animated: true` so sharp defaults to extracting only the first frame
    pipeline = sharp(resolvedInput, { failOn: 'truncated' });
    
    // Read input metadata to verify it's an image
    metadata = await pipeline.metadata();
  } catch (err) {
    throw new NormalizationError(`Unsupported or corrupt image format: ${err.message}`);
  }

  if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format)) {
    throw new NormalizationError(`Unsupported image format: ${metadata.format}`);
  }

  logger.info('Image normalization started', {
    inputPath: resolvedInput,
    inputFormat: metadata.format,
    inputDimensions: `${metadata.width}x${metadata.height}`
  });

  try {
    // 3. Transformation Pipeline
    await pipeline
      .rotate() // Auto-orient based on EXIF
      .resize({
        width: config.IMAGE_NORMALIZE_MAX_WIDTH,
        height: config.IMAGE_NORMALIZE_MAX_HEIGHT,
        fit: 'inside', // Proportional downscaling
        withoutEnlargement: true // Never scale up
      })
      .flatten({ background: '#FFFFFF' }) // Deterministic solid background for transparent images
      .jpeg({ quality: config.IMAGE_NORMALIZE_JPEG_QUALITY }) // Canonical output format
      .toFile(tmpOutputPath);
  } catch (err) {
    // Cleanup partial temp output on failure
    await fs.unlink(tmpOutputPath).catch(() => null);
    throw new NormalizationError(`Transformation failed: ${err.message}`);
  }

  // 4. Output Validation & Atomic Rename
  let outputStats;
  let outputMetadata;
  try {
    outputStats = await fs.stat(tmpOutputPath);
    outputMetadata = await sharp(tmpOutputPath).metadata();
    
    if (outputMetadata.format !== 'jpeg') {
       throw new Error(`Output format was ${outputMetadata.format}, expected jpeg`);
    }

    if (outputMetadata.width > config.IMAGE_NORMALIZE_MAX_WIDTH || outputMetadata.height > config.IMAGE_NORMALIZE_MAX_HEIGHT) {
       throw new Error(`Output dimensions ${outputMetadata.width}x${outputMetadata.height} exceed limits`);
    }

    // Atomically rename temporary output to final artifact path
    await fs.rename(tmpOutputPath, finalOutputPath);
  } catch (err) {
    await fs.unlink(tmpOutputPath).catch(() => null);
    throw new NormalizationError(`Output validation failed: ${err.message}`);
  }

  const durationMs = Date.now() - startTime;

  logger.info('Image normalization completed', {
    outputPath: finalOutputPath,
    outputFormat: outputMetadata.format,
    outputDimensions: `${outputMetadata.width}x${outputMetadata.height}`,
    outputSize: outputStats.size,
    durationMs
  });

  // Return structured artifact
  return {
    outputPath: finalOutputPath,
    width: outputMetadata.width,
    height: outputMetadata.height,
    format: outputMetadata.format,
    sizeBytes: outputStats.size
  };
}
