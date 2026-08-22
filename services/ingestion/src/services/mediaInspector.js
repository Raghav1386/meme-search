import fs from 'fs/promises';
import config from '../config/index.js';

export class UnsupportedMediaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedMediaError';
  }
}

export class CorruptMediaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CorruptMediaError';
  }
}

export class DimensionLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DimensionLimitError';
  }
}

export class FileSizeLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FileSizeLimitError';
  }
}

function parseDimensions(buffer, mimeType) {
  if (mimeType === 'image/png') {
    if (buffer.length < 24) throw new CorruptMediaError('PNG truncated');
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  
  if (mimeType === 'image/gif') {
    if (buffer.length < 10) throw new CorruptMediaError('GIF truncated');
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  
  if (mimeType === 'image/webp') {
    if (buffer.length < 30) throw new CorruptMediaError('WebP truncated');
    const chunkHeader = buffer.toString('ascii', 12, 16);
    if (chunkHeader === 'VP8 ') {
      // 14 bits for width and height at offset 26
      const b0 = buffer[26]; const b1 = buffer[27]; const b2 = buffer[28]; const b3 = buffer[29];
      return { width: (b0 | b1 << 8) & 0x3FFF, height: (b2 | b3 << 8) & 0x3FFF };
    } else if (chunkHeader === 'VP8X') {
      // 24 bits for width-1 and height-1 at offset 24
      const w = 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16);
      const h = 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16);
      return { width: w, height: h };
    } else if (chunkHeader === 'VP8L') {
      // 14 bits at offset 21
      const b0 = buffer[21]; const b1 = buffer[22]; const b2 = buffer[23]; const b3 = buffer[24];
      const w = 1 + (((b1 & 0x3F) << 8) | b0);
      const h = 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6));
      return { width: w, height: h };
    }
    throw new CorruptMediaError('Unsupported WebP chunk');
  }
  
  if (mimeType === 'image/jpeg') {
    let offset = 2; // Skip FF D8
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xFF) break;
      const marker = buffer[offset + 1];
      if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
        if (offset + 9 > buffer.length) break;
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
    throw new CorruptMediaError('JPEG missing SOF marker');
  }
  
  return null;
}

export async function inspectMedia(filePath) {
  let stats;
  try {
    stats = await fs.stat(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`Temporary file not found: ${filePath}`);
    throw err; // transient
  }

  if (!stats.isFile()) {
    throw new CorruptMediaError('Path is not a regular file');
  }

  if (stats.size === 0) {
    throw new CorruptMediaError('Zero-byte file acquired');
  }

  if (stats.size > config.MEDIA_MAX_BYTES) {
    throw new FileSizeLimitError(`File size ${stats.size} exceeds maximum ${config.MEDIA_MAX_BYTES}`);
  }

  // Read up to first 64KB for safe marker scanning (JPEGs can have large APP1/EXIF segments)
  let fh;
  let buffer = Buffer.alloc(65536);
  let bytesRead = 0;
  
  try {
    fh = await fs.open(filePath, 'r');
    const res = await fh.read(buffer, 0, buffer.length, 0);
    bytesRead = res.bytesRead;
  } finally {
    if (fh) await fh.close();
  }

  buffer = buffer.subarray(0, bytesRead);
  if (bytesRead < 8) {
    throw new CorruptMediaError('File too small to inspect');
  }

  let mimeType = null;
  let mediaType = null;
  let extension = null;

  // Magic Number matching
  // JPEG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    mimeType = 'image/jpeg';
    mediaType = 'image';
    extension = '.jpg';
  } 
  // PNG
  else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    mimeType = 'image/png';
    mediaType = 'image';
    extension = '.png';
  }
  // GIF
  else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    mimeType = 'image/gif';
    mediaType = 'image';
    extension = '.gif';
  }
  // WEBP
  else if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    mimeType = 'image/webp';
    mediaType = 'image';
    extension = '.webp';
  }
  // MP4
  else if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    mimeType = 'video/mp4';
    mediaType = 'video';
    extension = '.mp4';
  }
  // WEBM
  else if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
    mimeType = 'video/webm';
    mediaType = 'video';
    extension = '.webm';
  } else {
    throw new UnsupportedMediaError('Could not identify valid image or video format from magic numbers');
  }

  // Parse Metadata
  let dimensions = null;
  let duration = null;

  if (mediaType === 'image') {
    dimensions = parseDimensions(buffer, mimeType);
    if (!dimensions) {
       throw new CorruptMediaError(`Failed to parse dimensions from ${mimeType}`);
    }
  } else if (mediaType === 'video') {
    throw new UnsupportedMediaError('Video dimension/duration extraction is natively unsupported in this phase without dependencies');
  }

  if (dimensions) {
    if (dimensions.width < config.MEDIA_MIN_WIDTH || dimensions.height < config.MEDIA_MIN_HEIGHT) {
      throw new DimensionLimitError(`Dimensions ${dimensions.width}x${dimensions.height} fall below minimum allowed ${config.MEDIA_MIN_WIDTH}x${config.MEDIA_MIN_HEIGHT}`);
    }
    if (dimensions.width > config.MEDIA_MAX_WIDTH || dimensions.height > config.MEDIA_MAX_HEIGHT) {
      throw new DimensionLimitError(`Dimensions ${dimensions.width}x${dimensions.height} exceed maximum allowed ${config.MEDIA_MAX_WIDTH}x${config.MEDIA_MAX_HEIGHT}`);
    }
  }

  return {
    media_type: mediaType,
    mime_type: mimeType,
    file_size_bytes: stats.size,
    width: dimensions ? dimensions.width : null,
    height: dimensions ? dimensions.height : null,
    duration_ms: duration,
    extension
  };
}
