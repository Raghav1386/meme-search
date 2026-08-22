import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import config from '../config/index.js';
import logger from '../utils/logger.js';

export class StorageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StorageError';
  }
}

export class StorageConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StorageConfigurationError';
  }
}

const hmac = (key, string) => crypto.createHmac('sha256', key).update(string, 'utf8').digest();
const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function signV4(method, url, headers, payloadHash, region, service, accessKey, secretKey) {
  const amzdate = headers['x-amz-date'];
  const datestamp = amzdate.substring(0, 8);
  const parsedUrl = new URL(url);

  // 1. Canonical Request
  const canonicalUri = parsedUrl.pathname;
  const canonicalQuerystring = '';
  const canonicalHeaders = Object.keys(headers).sort().map(k => `${k.toLowerCase()}:${headers[k]}\n`).join('');
  const signedHeaders = Object.keys(headers).sort().map(k => k.toLowerCase()).join(';');
  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  // 2. String to sign
  const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzdate}\n${credentialScope}\n${hash(canonicalRequest)}`;

  // 3. Signature
  const kDate = hmac(`AWS4${secretKey}`, datestamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign).toString('hex');

  return `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

export async function uploadCanonicalArtifact({ filePath, objectKey, contentType, contentLength }) {
  const startTime = Date.now();
  
  if (!filePath || !objectKey) {
    throw new StorageConfigurationError('filePath and objectKey are required');
  }

  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(path.resolve(os.tmpdir()))) {
    throw new StorageError('File path must reside within tmpdir');
  }

  let stats;
  try {
    stats = await fs.stat(resolvedPath);
  } catch (err) {
    throw new StorageError(`File does not exist: ${err.message}`);
  }

  if (stats.size === 0) throw new StorageError('Artifact is zero bytes');
  if (stats.size > (config.MEDIA_STORAGE_MAX_UPLOAD_BYTES || 10485760)) {
    throw new StorageError(`Artifact exceeds max size of ${config.MEDIA_STORAGE_MAX_UPLOAD_BYTES}`);
  }

  // Calculate SHA-256 content hash
  const fileBuffer = await fs.readFile(resolvedPath);
  const sha256 = hash(fileBuffer);

  const baseResult = {
    object_key: objectKey,
    storage_provider: config.MEDIA_STORAGE_PROVIDER || 's3',
    content_type: contentType || 'image/jpeg',
    content_length: stats.size,
    sha256,
    url: null,
    etag: null
  };

  if (!config.MEDIA_STORAGE_ENABLED) {
    logger.info('Canonical artifact upload skipped (disabled)', { objectKey, sha256 });
    return { ...baseResult, skipped: true };
  }

  if (!config.MEDIA_STORAGE_BUCKET || !config.MEDIA_STORAGE_REGION) {
    throw new StorageConfigurationError('Bucket and Region are required when storage is enabled');
  }

  logger.info('Canonical artifact upload started', { objectKey, sha256, size: stats.size });

  const endpoint = config.MEDIA_STORAGE_ENDPOINT || `https://${config.MEDIA_STORAGE_BUCKET}.s3.${config.MEDIA_STORAGE_REGION}.amazonaws.com`;
  let uploadUrl = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
  
  // If endpoint is a custom domain and we need path-style vs virtual-hosted style
  // We assume path-style if ENDPOINT is set for local testing/minio, otherwise virtual hosted.
  if (config.MEDIA_STORAGE_ENDPOINT && !uploadUrl.includes(config.MEDIA_STORAGE_BUCKET)) {
    uploadUrl += `/${config.MEDIA_STORAGE_BUCKET}`;
  }
  uploadUrl += `/${objectKey.replace(/^\//, '')}`;

  const amzdate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const parsedHost = new URL(uploadUrl).host;

  const headers = {
    'host': parsedHost,
    'content-type': contentType || 'image/jpeg',
    'content-length': stats.size.toString(),
    'x-amz-content-sha256': sha256,
    'x-amz-date': amzdate
  };

  if (config.MEDIA_STORAGE_ACCESS_KEY_ID && config.MEDIA_STORAGE_SECRET_ACCESS_KEY) {
    const authHeader = signV4(
      'PUT',
      uploadUrl,
      headers,
      sha256,
      config.MEDIA_STORAGE_REGION,
      's3',
      config.MEDIA_STORAGE_ACCESS_KEY_ID,
      config.MEDIA_STORAGE_SECRET_ACCESS_KEY
    );
    headers['authorization'] = authHeader;
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), config.MEDIA_STORAGE_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers,
      body: fileBuffer,
      signal: abortController.signal
    });

    if (!response.ok) {
      const isTransient = [408, 429, 500, 502, 503, 504].includes(response.status);
      const errText = await response.text().catch(() => '');
      const errMsg = `Storage returned ${response.status}: ${errText}`;
      
      // Sanitize secrets from error body just in case
      const sanitized = config.MEDIA_STORAGE_SECRET_ACCESS_KEY ? 
        errMsg.split(config.MEDIA_STORAGE_SECRET_ACCESS_KEY).join('[REDACTED]') : errMsg;

      const error = new Error(sanitized);
      error.isTransient = isTransient;
      error.status = response.status;
      throw error;
    }

    const etag = response.headers.get('etag') || response.headers.get('ETag');
    
    logger.info('Canonical artifact upload completed', { 
      objectKey, 
      durationMs: Date.now() - startTime,
      etag 
    });

    let publicUrl = null;
    if (config.MEDIA_STORAGE_PUBLIC_BASE_URL) {
      publicUrl = `${config.MEDIA_STORAGE_PUBLIC_BASE_URL.replace(/\/$/, '')}/${objectKey}`;
    }

    return {
      ...baseResult,
      etag: etag ? etag.replace(/"/g, '') : null,
      url: publicUrl,
      skipped: false
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      const error = new Error('Storage request timed out');
      error.isTransient = true;
      throw error;
    }
    
    if (err.code === 'ECONNRESET' || err.code === 'ENOTFOUND') {
      err.isTransient = true;
    }

    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
