import dotenv from 'dotenv';
dotenv.config();

const config = {
  PORT: parseInt(process.env.PORT || '4001', 10),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  REDIS_URL: process.env.REDIS_URL,
  MEDIA_REQUEST_TIMEOUT_MS: parseInt(process.env.MEDIA_REQUEST_TIMEOUT_MS || '10000', 10),
  MEDIA_MAX_BYTES: parseInt(process.env.MEDIA_MAX_BYTES || '10485760', 10),
  MEDIA_MIN_WIDTH: parseInt(process.env.MEDIA_MIN_WIDTH || '32', 10),
  MEDIA_MIN_HEIGHT: parseInt(process.env.MEDIA_MIN_HEIGHT || '32', 10),
  MEDIA_MAX_WIDTH: parseInt(process.env.MEDIA_MAX_WIDTH || '10000', 10),
  MEDIA_MAX_HEIGHT: parseInt(process.env.MEDIA_MAX_HEIGHT || '10000', 10),
  MEDIA_MAX_VIDEO_DURATION_MS: parseInt(process.env.MEDIA_MAX_VIDEO_DURATION_MS || '300000', 10),
  IMAGE_NORMALIZE_MAX_WIDTH: parseInt(process.env.IMAGE_NORMALIZE_MAX_WIDTH || '1024', 10),
  IMAGE_NORMALIZE_MAX_HEIGHT: parseInt(process.env.IMAGE_NORMALIZE_MAX_HEIGHT || '1024', 10),
  IMAGE_NORMALIZE_JPEG_QUALITY: parseInt(process.env.IMAGE_NORMALIZE_JPEG_QUALITY || '85', 10),
  MEDIA_STORAGE_ENABLED: process.env.MEDIA_STORAGE_ENABLED === 'true',
  MEDIA_STORAGE_PROVIDER: process.env.MEDIA_STORAGE_PROVIDER || 's3',
  MEDIA_STORAGE_BUCKET: process.env.MEDIA_STORAGE_BUCKET,
  MEDIA_STORAGE_REGION: process.env.MEDIA_STORAGE_REGION,
  MEDIA_STORAGE_ENDPOINT: process.env.MEDIA_STORAGE_ENDPOINT,
  MEDIA_STORAGE_ACCESS_KEY_ID: process.env.MEDIA_STORAGE_ACCESS_KEY_ID,
  MEDIA_STORAGE_SECRET_ACCESS_KEY: process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY,
  MEDIA_STORAGE_PUBLIC_BASE_URL: process.env.MEDIA_STORAGE_PUBLIC_BASE_URL,
  MEDIA_STORAGE_REQUEST_TIMEOUT_MS: parseInt(process.env.MEDIA_STORAGE_REQUEST_TIMEOUT_MS || '10000', 10),
  MEDIA_STORAGE_MAX_UPLOAD_BYTES: parseInt(process.env.MEDIA_STORAGE_MAX_UPLOAD_BYTES || '10485760', 10),

  // Phase 4.1 B2 Storage (Isolated)
  INGESTION_B2_BUCKET: process.env.INGESTION_B2_BUCKET,
  INGESTION_B2_KEY_PREFIX: process.env.INGESTION_B2_KEY_PREFIX || 'backend/memes/',
  B2_KEY_ID: process.env.B2_KEY_ID,
  B2_APP_KEY: process.env.B2_APP_KEY,

  // Database & Python Integration (Isolated)
  INGESTION_DATABASE_URL: process.env.INGESTION_DATABASE_URL,
  INGESTION_PYTHON_SERVICE_URL: process.env.INGESTION_PYTHON_SERVICE_URL || 'http://127.0.0.1:8001',
  INGESTION_QUEUE_NAME: process.env.INGESTION_QUEUE_NAME || 'meme-ingestion-test',
  INGESTION_WORKER_CONCURRENCY: parseInt(process.env.INGESTION_WORKER_CONCURRENCY || '1', 10),
};

// Validate required config here
export function validateConfig() {
  const required = ['PORT', 'REDIS_URL', 'INGESTION_DATABASE_URL', 'INGESTION_B2_BUCKET', 'INGESTION_PYTHON_SERVICE_URL'];
  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`CRITICAL: Missing required isolated configuration: ${missing.join(', ')}`);
  }

  // Ensure absolutely no fallback to legacy db URLs
  if (process.env.NEON_DATABASE_URL || process.env.DISCOVERY_DATABASE_URL || process.env.B2_BUCKET_NAME) {
    console.warn('WARNING: Legacy configuration variables detected in environment. These will be strictly ignored by Ingestion.');
  }

  if (isNaN(config.MEDIA_REQUEST_TIMEOUT_MS) || config.MEDIA_REQUEST_TIMEOUT_MS <= 0) {
    throw new Error('MEDIA_REQUEST_TIMEOUT_MS must be a positive integer');
  }

  if (isNaN(config.MEDIA_MAX_BYTES) || config.MEDIA_MAX_BYTES <= 0) {
    throw new Error('MEDIA_MAX_BYTES must be a positive integer');
  }

  if (isNaN(config.MEDIA_MIN_WIDTH) || config.MEDIA_MIN_WIDTH <= 0) throw new Error('MEDIA_MIN_WIDTH must be a positive integer');
  if (isNaN(config.MEDIA_MIN_HEIGHT) || config.MEDIA_MIN_HEIGHT <= 0) throw new Error('MEDIA_MIN_HEIGHT must be a positive integer');
  if (isNaN(config.MEDIA_MAX_WIDTH) || config.MEDIA_MAX_WIDTH <= config.MEDIA_MIN_WIDTH) throw new Error('MEDIA_MAX_WIDTH must be greater than min');
  if (isNaN(config.MEDIA_MAX_HEIGHT) || config.MEDIA_MAX_HEIGHT <= config.MEDIA_MIN_HEIGHT) throw new Error('MEDIA_MAX_HEIGHT must be greater than min');
  if (isNaN(config.MEDIA_MAX_VIDEO_DURATION_MS) || config.MEDIA_MAX_VIDEO_DURATION_MS <= 0) throw new Error('MEDIA_MAX_VIDEO_DURATION_MS must be a positive integer');
  if (isNaN(config.IMAGE_NORMALIZE_MAX_WIDTH) || config.IMAGE_NORMALIZE_MAX_WIDTH <= 0) throw new Error('IMAGE_NORMALIZE_MAX_WIDTH must be a positive integer');
  if (isNaN(config.IMAGE_NORMALIZE_MAX_HEIGHT) || config.IMAGE_NORMALIZE_MAX_HEIGHT <= 0) throw new Error('IMAGE_NORMALIZE_MAX_HEIGHT must be a positive integer');
  if (isNaN(config.IMAGE_NORMALIZE_JPEG_QUALITY) || config.IMAGE_NORMALIZE_JPEG_QUALITY < 1 || config.IMAGE_NORMALIZE_JPEG_QUALITY > 100) throw new Error('IMAGE_NORMALIZE_JPEG_QUALITY must be between 1 and 100');

  if (config.MEDIA_STORAGE_ENABLED) {
    if (!config.MEDIA_STORAGE_BUCKET && !config.INGESTION_B2_BUCKET) throw new Error('INGESTION_B2_BUCKET is required when storage is enabled');
    if (!config.B2_KEY_ID) throw new Error('B2_KEY_ID is required');
    if (!config.B2_APP_KEY) throw new Error('B2_APP_KEY is required');
  }
}

export default config;
