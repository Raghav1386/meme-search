import config from '../config/index.js';
import logger from '../utils/logger.js';

export class IndexerError extends Error {
  constructor(message, isTransient = false) {
    super(message);
    this.name = 'IndexerError';
    this.isTransient = isTransient;
  }
}

/**
 * Calls the Python FastAPI /index-meme endpoint to perform OCR and CLIP embedding.
 * 
 * @param {string} b2Key - The exact Backblaze B2 key (e.g., 'backend/memes/caption-hash.jpg')
 * @param {string} caption - The original meme caption
 * @param {boolean} forceReindex - Whether to force re-indexing
 * @returns {Promise<Object>} The response from the FastAPI server
 */
export async function indexMeme(b2Key, caption = '', forceReindex = false) {
  if (!b2Key) {
    throw new IndexerError('b2Key is required for indexing', false);
  }

  const endpoint = `${config.INGESTION_REAL_PROCESSOR_URL || 'http://127.0.0.1:8000'}/index-meme`;
  const payload = {
    b2_key: b2Key,
    caption: caption
  };

  logger.info(`Starting indexing for ${b2Key}`, { endpoint });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60-second timeout for ML inference

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    // 5xx and 429 are transient
    if (response.status >= 500 || response.status === 429) {
      throw new IndexerError(`HTTP ${response.status} ${response.statusText}`, true);
    }
    
    // 4xx are permanent
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage += ` - ${JSON.stringify(errorData)}`;
      } catch (e) {
        // Ignore
      }
      throw new IndexerError(errorMessage, false);
    }

    const data = await response.json();
    
    logger.info(`Indexing completed successfully for ${b2Key}`, { 
      status: data.status,
      ocr_length: data.ocr_text ? data.ocr_text.length : 0,
      embedding_dims: data.embedding_dimensions
    });

    return data;
  } catch (err) {
    const isTransient = err.isTransient !== undefined ? err.isTransient : (
      err.name === 'AbortError' ||
      err.message.includes('fetch failed') ||
      err.message.includes('ECONNRESET') ||
      err.message.includes('ETIMEDOUT')
    );

    throw new IndexerError(`Python Indexer failed: ${err.message}`, isTransient);
  }
}
