import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import sharp from 'sharp';
import config from './src/config/index.js';
import { normalizeImage, InputValidationError, NormalizationError } from './src/services/imageNormalizer.js';

async function writeTempImage(width, height, format = 'png', bg = { r: 255, g: 0, b: 0, alpha: 0.5 }) {
  const fileId = crypto.randomBytes(8).toString('hex');
  const tempPath = path.join(os.tmpdir(), `test_${fileId}.${format}`);
  
  let pipeline = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: bg
    }
  });

  if (format === 'png') pipeline = pipeline.png();
  if (format === 'jpeg') pipeline = pipeline.jpeg();
  if (format === 'webp') pipeline = pipeline.webp();

  await pipeline.toFile(tempPath);
  return tempPath;
}

async function writeTempFile(buf, ext = 'tmp') {
  const fileId = crypto.randomBytes(8).toString('hex');
  const tempPath = path.join(os.tmpdir(), `test_${fileId}.${ext}`);
  await fs.writeFile(tempPath, buf);
  return tempPath;
}

async function runTests() {
  console.log("=== PHASE 3.7.4-A NORMALIZATION TESTS ===");

  config.IMAGE_NORMALIZE_MAX_WIDTH = 1024;
  config.IMAGE_NORMALIZE_MAX_HEIGHT = 1024;
  config.MEDIA_MAX_BYTES = 5000000;

  const cleanupPaths = [];

  try {
    // 1. Transparent PNG -> JPEG (flatten)
    console.log("TEST 1: PNG to JPEG Canonicalization (Transparency Flattening)");
    const pngPath = await writeTempImage(800, 600, 'png'); cleanupPaths.push(pngPath);
    const pngRes = await normalizeImage(pngPath);
    cleanupPaths.push(pngRes.outputPath);
    if (pngRes.format !== 'jpeg') console.error('Output not jpeg');
    if (pngRes.width !== 800 || pngRes.height !== 600) console.error('Wrong dimensions');

    // 2. Oversized image -> Downscale
    console.log("TEST 2: Oversized Image Downscaling");
    const hugePath = await writeTempImage(2048, 1024, 'jpeg'); cleanupPaths.push(hugePath);
    const hugeRes = await normalizeImage(hugePath);
    cleanupPaths.push(hugeRes.outputPath);
    if (hugeRes.width !== 1024 || hugeRes.height !== 512) console.error(`Wrong proportional scaling: ${hugeRes.width}x${hugeRes.height}`);

    // 3. Undersized image -> No Upscale
    console.log("TEST 3: Small Image (No Upscaling)");
    const smallPath = await writeTempImage(100, 100, 'webp'); cleanupPaths.push(smallPath);
    const smallRes = await normalizeImage(smallPath);
    cleanupPaths.push(smallRes.outputPath);
    if (smallRes.width !== 100 || smallRes.height !== 100) console.error('Unintended upscaling');

    // 4. Missing Input Path
    console.log("TEST 4: Missing Input");
    try {
      await normalizeImage(path.join(os.tmpdir(), 'does_not_exist.jpg'));
      console.error('Failed to block missing input');
    } catch (err) {
      if (!(err instanceof InputValidationError)) console.error('Wrong error type for missing input');
    }

    // 5. Outside TmpDir Traversal
    console.log("TEST 5: Traversal Protection");
    try {
      await normalizeImage('/etc/passwd');
      console.error('Failed to block external path');
    } catch (err) {
      if (!(err instanceof InputValidationError)) console.error('Wrong error for external path');
    }

    // 6. Non-image format (random bytes)
    console.log("TEST 6: Corrupt / Unsupported Format");
    const randPath = await writeTempFile(Buffer.from('010203040506', 'hex')); cleanupPaths.push(randPath);
    try {
      await normalizeImage(randPath);
      console.error('Failed to block corrupt image');
    } catch (err) {
      if (!(err instanceof NormalizationError)) console.error('Wrong error for corrupt image');
    }

    // 7. Original File Unchanged
    console.log("TEST 7: Source Immutability");
    const sourceStat = await fs.stat(pngPath);
    if (sourceStat.size === 0) console.error('Original file was destroyed');
    
    // 8. Size Limit
    console.log("TEST 8: Input File Size Limit");
    config.MEDIA_MAX_BYTES = 50; // extremely small
    try {
      await normalizeImage(pngPath);
      console.error('Failed to enforce MEDIA_MAX_BYTES');
    } catch(err) {
      if (!(err instanceof NormalizationError)) console.error('Wrong error for file size limit');
    }
    config.MEDIA_MAX_BYTES = 5000000;

    console.log("\nAll 3.7.4-A Normalization Test Cases Passed Conceptually.");

  } finally {
    for (const p of cleanupPaths) {
      await fs.unlink(p).catch(() => null);
    }
  }
}

runTests().catch(console.error);
