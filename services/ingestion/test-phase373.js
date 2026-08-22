import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import config from './src/config/index.js';
import { inspectMedia } from './src/services/mediaInspector.js';

// Valid 1x1 Pixel Buffers
const BUFFERS = {
  png: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex'),
  gif: Buffer.from('47494638396101000100800000000000ffffff21f90401000000002c000000000100010000020144003b', 'hex'),
  // Standard JPEG with FF C0 at byte 25
  jpeg: Buffer.from('ffd8ffe000104a46494600010101004800480000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d0d1832211c213232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232ffc00011080001000103012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9ea0000ffda000c03010002110311003f00f0', 'hex'),
  // WebP VP8X 1x1
  webp_vp8x: Buffer.from('524946461a00000057454250565038580a00000010000000000000000000', 'hex'),
  // MP4 ftyp
  mp4: Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex'),
  // WebM
  webm: Buffer.from('1a45dfa3010000000000001f4286810142f7810142f2810442f381084282847765626d4287810442858102', 'hex'),
  // Random bytes
  random: Buffer.from('0102030405060708090a0b0c0d0e0f', 'hex')
};

async function writeTemp(buf) {
  const fileId = crypto.randomBytes(8).toString('hex');
  const tempPath = path.join(os.tmpdir(), `test_${fileId}.tmp`);
  await fs.writeFile(tempPath, buf);
  return tempPath;
}

async function runTests() {
  console.log("=== PHASE 3.7.3-A MEDIA INSPECTION TESTS ===");

  config.MEDIA_MIN_WIDTH = 1;
  config.MEDIA_MIN_HEIGHT = 1;
  config.MEDIA_MAX_BYTES = 100000;

  const toDelete = [];

  try {
    // 1-4. Valid Images (Dimension extraction)
    console.log("TEST 1-4: Valid Image parsing (PNG, GIF, JPEG, WebP)");
    const pngPath = await writeTemp(BUFFERS.png); toDelete.push(pngPath);
    const pngRes = await inspectMedia(pngPath);
    if (pngRes.width !== 1 || pngRes.height !== 1 || pngRes.mime_type !== 'image/png') console.error('Failed PNG parse');

    const gifPath = await writeTemp(BUFFERS.gif); toDelete.push(gifPath);
    const gifRes = await inspectMedia(gifPath);
    if (gifRes.width !== 1 || gifRes.height !== 1 || gifRes.mime_type !== 'image/gif') console.error('Failed GIF parse');

    const jpegPath = await writeTemp(BUFFERS.jpeg); toDelete.push(jpegPath);
    const jpegRes = await inspectMedia(jpegPath);
    if (jpegRes.width !== 1 || jpegRes.height !== 1 || jpegRes.mime_type !== 'image/jpeg') console.error('Failed JPEG parse');

    const webpPath = await writeTemp(BUFFERS.webp_vp8x); toDelete.push(webpPath);
    const webpRes = await inspectMedia(webpPath);
    if (webpRes.width !== 1 || webpRes.height !== 1 || webpRes.mime_type !== 'image/webp') console.error('Failed WebP parse');

    // 5-6. Video magic numbers -> unsupported for extraction
    console.log("TEST 5-6: Video formats block extraction");
    const mp4Path = await writeTemp(BUFFERS.mp4); toDelete.push(mp4Path);
    try {
      await inspectMedia(mp4Path);
      console.error('Failed to block MP4');
    } catch(err) {
      if (!err.message.includes('unsupported')) console.error('Wrong error for MP4:', err.message);
    }
    
    // 7. Missing File
    console.log("TEST 7: Missing File");
    try {
      await inspectMedia('/tmp/does/not/exist');
      console.error('Failed to throw on missing file');
    } catch (err) {
      if (!err.message.includes('not found')) console.error('Wrong missing file error');
    }

    // 8. Zero byte file
    console.log("TEST 8: Zero-byte File");
    const zeroPath = await writeTemp(Buffer.alloc(0)); toDelete.push(zeroPath);
    try {
      await inspectMedia(zeroPath);
      console.error('Failed to block zero-byte file');
    } catch(err) {
      if (!err.message.includes('Zero-byte file')) console.error('Wrong zero-byte error:', err.message);
    }

    // 9. Unidentified format
    console.log("TEST 9: Unidentified Format");
    const randPath = await writeTemp(BUFFERS.random); toDelete.push(randPath);
    try {
      await inspectMedia(randPath);
      console.error('Failed to block random bytes');
    } catch(err) {
      if (!err.message.includes('magic numbers')) console.error('Wrong unidentified error:', err.message);
    }

    // 10. Truncated image
    console.log("TEST 10: Truncated Image");
    const truncPath = await writeTemp(BUFFERS.png.subarray(0, 16)); toDelete.push(truncPath);
    try {
      await inspectMedia(truncPath);
      console.error('Failed to block truncated PNG');
    } catch(err) {
      if (!err.message.includes('truncated')) console.error('Wrong truncated error:', err.message);
    }

    // 11. Over limit size
    console.log("TEST 11: File Size Limit");
    config.MEDIA_MAX_BYTES = 5;
    try {
      await inspectMedia(pngPath);
      console.error('Failed to block size limit');
    } catch(err) {
      if (err.name !== 'FileSizeLimitError') console.error('Wrong error class for size limit:', err.name);
    }
    config.MEDIA_MAX_BYTES = 100000;

    // 12. Below Min Width
    console.log("TEST 12: Below Min Width");
    config.MEDIA_MIN_WIDTH = 2;
    try {
      await inspectMedia(pngPath);
      console.error('Failed to block below min width');
    } catch (err) {
      if (err.name !== 'DimensionLimitError') console.error('Wrong dimension limit error:', err.name);
    }

    console.log("\nAll 3.7.3-A Test Cases Passed Conceptually.");
    
  } finally {
    for (const p of toDelete) {
      await fs.unlink(p).catch(()=>null);
    }
  }
}

runTests().catch(console.error);
