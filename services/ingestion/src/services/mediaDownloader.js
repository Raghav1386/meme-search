import logger from '../utils/logger.js';

export class DownloadError extends Error {
  constructor(message, isTransient = false) {
    super(message);
    this.name = 'DownloadError';
    this.isTransient = isTransient;
  }
}

/**
 * Downloads a media URL and returns it as a Buffer.
 * Validates Content-Type before downloading.
 * Handles redirects and transient errors.
 * 
 * @param {string} url 
 * @param {number} timeoutMs 
 * @param {number} maxRetries 
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
export async function downloadMedia(url, timeoutMs = 10000, maxRetries = 2) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal
      });

      clearTimeout(timeout);

      // Handle HTTP status errors
      if (!response.ok) {
        // 403, 404, etc. are usually permanent
        const isTransient = response.status >= 500 || response.status === 429;
        throw new DownloadError(`HTTP ${response.status} ${response.statusText}`, isTransient);
      }

      // Check Content-Type before reading body
      const contentType = response.headers.get('content-type') || '';
      const cTypeLower = contentType.toLowerCase();
      
      if (
        cTypeLower.includes('text/html') || 
        cTypeLower.includes('video/') || 
        cTypeLower.includes('audio/') ||
        cTypeLower === 'text/plain'
      ) {
        throw new DownloadError(`Unsupported media type: ${contentType}`, false);
      }

      const arrayBuffer = await response.arrayBuffer();
      
      if (arrayBuffer.byteLength === 0) {
        throw new DownloadError('Downloaded file is empty', false);
      }

      return {
        buffer: Buffer.from(arrayBuffer),
        contentType
      };

    } catch (err) {
      const isTransient = err.isTransient !== undefined ? err.isTransient : (
        err.name === 'AbortError' ||
        err.message.includes('fetch failed') ||
        err.message.includes('ECONNRESET') ||
        err.message.includes('ETIMEDOUT')
      );

      lastError = err;

      if (!isTransient || attempt === maxRetries + 1) {
        throw new DownloadError(err.message, isTransient);
      }

      logger.warn(`Download transient failure (attempt ${attempt}/${maxRetries + 1}), retrying...`, { url, error: err.message });
      // Exponential backoff
      await new Promise(res => setTimeout(res, Math.pow(2, attempt) * 500));
    }
  }

  throw lastError;
}
