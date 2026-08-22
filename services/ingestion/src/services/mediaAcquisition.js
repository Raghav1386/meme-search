import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime'
];

const FORBIDDEN_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254' // Common AWS metadata endpoint
];

function isForbiddenHostname(hostname) {
  if (FORBIDDEN_HOSTNAMES.includes(hostname.toLowerCase())) return true;
  
  // Basic IPv4 private range checks
  if (hostname.match(/^10\./)) return true;
  if (hostname.match(/^192\.168\./)) return true;
  if (hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) return true;
  
  return false;
}

export async function acquireMedia(candidate) {
  const result = {
    status: 'failed',
    candidate_id: candidate?.candidate_id,
    media_url: candidate?.media_url,
    local_path: null,
    content_type: null,
    content_length: null,
    error: null
  };

  try {
    if (!candidate || !candidate.candidate_id || !candidate.platform || !candidate.platform_content_id) {
      result.error = 'Invalid candidate structure provided to acquisition service';
      return result;
    }

    if (!candidate.media_url) {
      result.status = 'skipped';
      result.error = 'Candidate has no media_url configured';
      return result;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(candidate.media_url);
    } catch (err) {
      result.error = 'Malformed media_url';
      return result;
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      result.error = `Unsupported protocol: ${parsedUrl.protocol}`;
      return result;
    }

    let currentUrl = candidate.media_url;
    let response = null;
    let redirects = 0;
    const MAX_REDIRECTS = 3;
    let controller;
    let timeoutId;

    while (redirects <= MAX_REDIRECTS) {
      let u;
      try {
        u = new URL(currentUrl);
      } catch (err) {
        throw new Error('Malformed redirect URL');
      }
      
      if (isForbiddenHostname(u.hostname)) {
        throw new Error('SSRF blocked: Forbidden hostname detected');
      }

      controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), config.MEDIA_REQUEST_TIMEOUT_MS);

      try {
        response = await fetch(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': 'MemeSearch/1.0.0'
          }
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
        let location = response.headers.get('location');
        if (!location.startsWith('http')) {
          const base = new URL(currentUrl);
          location = new URL(location, base).href;
        }
        currentUrl = location;
        redirects++;
        
        // Discard response body of the redirect manually since Node 18 fetch keeps it alive otherwise.
        if (response.body) {
          try {
            await response.arrayBuffer();
          } catch(e) {}
        }
        
        continue;
      }
      
      break; // Not a redirect, break the loop
    }

    if (redirects > MAX_REDIRECTS) {
      throw new Error(`Too many redirects (${MAX_REDIRECTS} max)`);
    }

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const cleanContentType = contentType.split(';')[0].trim().toLowerCase();
    
    if (!ALLOWED_CONTENT_TYPES.includes(cleanContentType)) {
      throw new Error(`Unsupported Content-Type: ${cleanContentType}`);
    }
    result.content_type = cleanContentType;

    const contentLengthHeader = response.headers.get('content-length');
    let expectedLength = 0;
    if (contentLengthHeader) {
      expectedLength = parseInt(contentLengthHeader, 10);
      if (isNaN(expectedLength)) expectedLength = 0;
      if (expectedLength > config.MEDIA_MAX_BYTES) {
        throw new Error(`Media size (${expectedLength} bytes) exceeds limit of ${config.MEDIA_MAX_BYTES}`);
      }
    }

    // We generate a safe temp file
    const fileId = crypto.randomBytes(16).toString('hex');
    const ext = cleanContentType.split('/')[1] || 'tmp';
    const tempPath = path.join(os.tmpdir(), `meme_ingest_${fileId}.${ext}`);

    let bytesWritten = 0;
    
    // We cannot just use pipeline(response.body, fs.createWriteStream) because we need to track bytes
    // and abort if it exceeds the limit (e.g. streaming without Content-Length)
    const writeStream = createWriteStream(tempPath);
    
    try {
      for await (const chunk of response.body) {
        bytesWritten += chunk.length;
        if (bytesWritten > config.MEDIA_MAX_BYTES) {
          throw new Error(`Streamed media size exceeded limit of ${config.MEDIA_MAX_BYTES} bytes`);
        }
        const canWrite = writeStream.write(chunk);
        if (!canWrite) {
          await new Promise(resolve => writeStream.once('drain', resolve));
        }
      }
      writeStream.end();
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
    } catch (err) {
      writeStream.destroy();
      // Attempt cleanup
      try { await fs.unlink(tempPath); } catch (e) {}
      throw err;
    }

    result.status = 'acquired';
    result.local_path = tempPath;
    result.content_length = bytesWritten;
    
    logger.info('Media acquired successfully', { 
      candidate_id: candidate.candidate_id, 
      bytes: bytesWritten, 
      type: cleanContentType 
    });

  } catch (err) {
    result.error = err.message;
    logger.warn('Media acquisition failed', { 
      candidate_id: candidate?.candidate_id,
      media_url: candidate?.media_url,
      error: err.message
    });
  }

  return result;
}
