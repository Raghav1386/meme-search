import B2 from 'backblaze-b2';
import config from '../config/index.js';
import logger from '../utils/logger.js';

let b2Client = null;
let b2BucketId = null;

export class StorageError extends Error {
  constructor(message, isTransient = false) {
    super(message);
    this.name = 'StorageError';
    this.isTransient = isTransient;
  }
}

/**
 * Initializes and authenticates the B2 client if not already done.
 */
async function initB2() {
  if (b2Client && b2BucketId) return { b2Client, b2BucketId };

  if (!config.B2_KEY_ID || !config.B2_APP_KEY || !config.INGESTION_B2_BUCKET) {
    throw new StorageError('Missing B2 credentials or INGESTION_B2_BUCKET configuration');
  }

  try {
    b2Client = new B2({
      applicationKeyId: config.B2_KEY_ID,
      applicationKey: config.B2_APP_KEY
    });

    await b2Client.authorize();
    
    // Get bucket ID based on name
    const response = await b2Client.getBucket({ bucketName: config.INGESTION_B2_BUCKET });
    const bucket = response.data.buckets[0];
    if (!bucket) {
      throw new StorageError(`Bucket not found: ${config.INGESTION_B2_BUCKET}`);
    }
    
    b2BucketId = bucket.bucketId;
    return { b2Client, b2BucketId };
  } catch (err) {
    b2Client = null; // reset so we can retry on next call
    throw new StorageError(`Failed to initialize B2: ${err.message}`, true);
  }
}

/**
 * Uploads a buffer to Backblaze B2.
 * 
 * @param {Buffer} buffer - The image bytes
 * @param {string} objectKey - The desired B2 path (e.g. backend/memes/when_the_code_works.jpg)
 * @param {string} contentType - e.g. 'image/jpeg'
 * @returns {Promise<string>} The uploaded object key
 */
export async function uploadToB2(buffer, objectKey, contentType) {
  if (config.MEDIA_STORAGE_ENABLED === false) {
    logger.info('B2 storage disabled, skipping upload');
    return objectKey;
  }

  try {
    const { b2Client, b2BucketId } = await initB2();

    // Get upload URL
    const uploadUrlResponse = await b2Client.getUploadUrl({
      bucketId: b2BucketId
    });

    const uploadUrl = uploadUrlResponse.data.uploadUrl;
    const authorizationToken = uploadUrlResponse.data.authorizationToken;

    // Upload file
    await b2Client.uploadFile({
      uploadUrl,
      uploadAuthToken: authorizationToken,
      fileName: objectKey,
      data: buffer,
      mime: contentType
    });

    return objectKey;
  } catch (err) {
    // If it's an authorization/timeout error, mark transient
    const isTransient = err.response?.status >= 500 || err.message.includes('timeout') || err.message.includes('auth');
    throw new StorageError(`Failed to upload to B2: ${err.message}`, isTransient);
  }
}
