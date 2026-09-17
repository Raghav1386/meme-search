import dotenv from 'dotenv';
dotenv.config();

const config = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  REDIS_URL: process.env.REDIS_URL,
  DISCOVERY_ENABLED: process.env.DISCOVERY_ENABLED !== 'false',
  DISCOVERY_RUN_MODE: process.env.DISCOVERY_RUN_MODE || 'test',
  DISCOVERY_MOCK_SOURCE_ENABLED: process.env.DISCOVERY_MOCK_SOURCE_ENABLED !== 'false',
  DISCOVERY_IMAGE_ONLY: process.env.DISCOVERY_IMAGE_ONLY !== 'false',
  
  // Trend Scoring
  TREND_WEIGHT_FRESHNESS: parseFloat(process.env.TREND_WEIGHT_FRESHNESS || '0.25'),
  TREND_WEIGHT_ENGAGEMENT: parseFloat(process.env.TREND_WEIGHT_ENGAGEMENT || '0.25'),
  TREND_WEIGHT_VELOCITY: parseFloat(process.env.TREND_WEIGHT_VELOCITY || '0.30'),
  TREND_WEIGHT_POPULARITY: parseFloat(process.env.TREND_WEIGHT_POPULARITY || '0.15'),
  TREND_WEIGHT_SOURCE: parseFloat(process.env.TREND_WEIGHT_SOURCE || '0.05'),
  TREND_FRESHNESS_DECAY_HOURS: parseFloat(process.env.TREND_FRESHNESS_DECAY_HOURS || '48'),
  TREND_VELOCITY_MIN_AGE_HOURS: parseFloat(process.env.TREND_VELOCITY_MIN_AGE_HOURS || '2'),
  
  // Filtering & Ranking
  TREND_MIN_SCORE: parseFloat(process.env.TREND_MIN_SCORE || '0'),
  TREND_MAX_CANDIDATES_PER_RUN: parseInt(process.env.TREND_MAX_CANDIDATES_PER_RUN || '200', 10),
  PHASH_DISTANCE_THRESHOLD: parseInt(process.env.PHASH_DISTANCE_THRESHOLD || '5', 10),
  
  // Phase 4 - Discovery Database & Scheduler
  DISCOVERY_DATABASE_URL: process.env.DISCOVERY_DATABASE_URL || process.env.DATABASE_URL,
  DISCOVERY_SCHEDULER_ENABLED: process.env.DISCOVERY_SCHEDULER_ENABLED !== 'false', // Default true
  DISCOVERY_SCHEDULE_CRON: process.env.DISCOVERY_SCHEDULE_CRON || '0 * * * *', // Default hourly

  // Apify & Reddit Actor Config
  DISCOVERY_APIFY_REDDIT_ENABLED: process.env.DISCOVERY_APIFY_REDDIT_ENABLED === 'true',
  APIFY_API_TOKEN: process.env.APIFY_API_TOKEN || '',
  APIFY_REDDIT_ACTOR: process.env.APIFY_REDDIT_ACTOR || 'harshmaur~reddit-scraper',
  
  // --- TREND ENGINE & FILTERING ---
  TREND_MIN_SCORE: parseFloat(process.env.TREND_MIN_SCORE || '0'),
  DISCOVERY_MIN_ACCEPTANCE_RATE: parseFloat(process.env.DISCOVERY_MIN_ACCEPTANCE_RATE || '0.70'),
  DISCOVERY_TARGET_ACCEPTANCE_RATE: parseFloat(process.env.DISCOVERY_TARGET_ACCEPTANCE_RATE || '0.80'),
  DISCOVERY_REDDIT_MAX_AGE_HOURS: parseFloat(process.env.DISCOVERY_REDDIT_MAX_AGE_HOURS || '48'),
  DISCOVERY_REDDIT_COLLECTION_LIMIT: parseInt(process.env.DISCOVERY_REDDIT_COLLECTION_LIMIT || '300', 10),

  // Phase 2B - Dynamic Topic Discovery
  DISCOVERY_MAX_DYNAMIC_QUERIES_PER_RUN: parseInt(process.env.DISCOVERY_MAX_DYNAMIC_QUERIES_PER_RUN || '3', 10),
  DISCOVERY_MAX_TOPICS: parseInt(process.env.DISCOVERY_MAX_TOPICS || '50', 10),
  DISCOVERY_TOPIC_MIN_FREQUENCY: parseInt(process.env.DISCOVERY_TOPIC_MIN_FREQUENCY || '2', 10),

  // YouTube Source
  DISCOVERY_YOUTUBE_SOURCE_ENABLED: process.env.DISCOVERY_YOUTUBE_SOURCE_ENABLED === 'true',
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || '',
  YOUTUBE_CHANNEL_IDS: (process.env.YOUTUBE_CHANNEL_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
  YOUTUBE_SEARCH_QUERY: process.env.YOUTUBE_SEARCH_QUERY || '',
  YOUTUBE_LIMIT: parseInt(process.env.YOUTUBE_LIMIT || '25', 10),
  YOUTUBE_REQUEST_TIMEOUT_MS: parseInt(process.env.YOUTUBE_REQUEST_TIMEOUT_MS || '10000', 10),
};

export function validateConfig() {
  const required = ['PORT', 'REDIS_URL'];
  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
  
  if (config.DISCOVERY_SCHEDULER_ENABLED) {
    // node-cron validation (simple inline regex for basic cron since we shouldn't necessarily import node-cron here, but we can do a loose check)
    if (!config.DISCOVERY_SCHEDULE_CRON || typeof config.DISCOVERY_SCHEDULE_CRON !== 'string' || config.DISCOVERY_SCHEDULE_CRON.split(' ').length < 5) {
       throw new Error('DISCOVERY_SCHEDULE_CRON is invalid. Provide a valid 5 or 6 part cron expression.');
    }
  }
  
  // Validate scoring config
  const weights = [
    config.TREND_WEIGHT_FRESHNESS,
    config.TREND_WEIGHT_ENGAGEMENT,
    config.TREND_WEIGHT_VELOCITY,
    config.TREND_WEIGHT_POPULARITY,
    config.TREND_WEIGHT_SOURCE
  ];
  if (weights.some(w => isNaN(w) || w < 0)) {
     throw new Error('Trend scoring weights must contain positive numbers.');
  }
  if (config.TREND_FRESHNESS_DECAY_HOURS <= 0 || config.TREND_VELOCITY_MIN_AGE_HOURS <= 0) {
     throw new Error('Trend decay/age constants must be strictly positive.');
  }

  // Validate filtering config
  if (isNaN(config.TREND_MIN_SCORE) || config.TREND_MIN_SCORE < 0 || config.TREND_MIN_SCORE > 100) {
     throw new Error('TREND_MIN_SCORE must be a finite number between 0 and 100.');
  }
  if (isNaN(config.TREND_MAX_CANDIDATES_PER_RUN) || config.TREND_MAX_CANDIDATES_PER_RUN <= 0 || config.TREND_MAX_CANDIDATES_PER_RUN > 1000) {
     throw new Error('TREND_MAX_CANDIDATES_PER_RUN must be a positive finite integer, maximum 1000.');
  }
  if (isNaN(config.PHASH_DISTANCE_THRESHOLD) || config.PHASH_DISTANCE_THRESHOLD < 0 || config.PHASH_DISTANCE_THRESHOLD > 64) {
     throw new Error('PHASH_DISTANCE_THRESHOLD must be between 0 and 64.');
  }

  // Validate Apify config
  if (config.DISCOVERY_APIFY_REDDIT_ENABLED) {
    if (!config.APIFY_API_TOKEN || config.APIFY_API_TOKEN === 'your_apify_token_here') {
      console.warn('[WARN] APIFY_API_TOKEN is missing or invalid. Apify Reddit adapter will fail if executed.');
    }
    if (isNaN(config.DISCOVERY_REDDIT_COLLECTION_LIMIT) || config.DISCOVERY_REDDIT_COLLECTION_LIMIT < 1 || config.DISCOVERY_REDDIT_COLLECTION_LIMIT > 500) {
      throw new Error('DISCOVERY_REDDIT_COLLECTION_LIMIT must be a positive integer between 1 and 500.');
    }
    if (isNaN(config.DISCOVERY_REDDIT_MIN_AGE_HOURS) || config.DISCOVERY_REDDIT_MIN_AGE_HOURS < 0) {
      throw new Error('DISCOVERY_REDDIT_MIN_AGE_HOURS must be a positive number.');
    }
    if (isNaN(config.DISCOVERY_REDDIT_MAX_AGE_HOURS) || config.DISCOVERY_REDDIT_MAX_AGE_HOURS <= config.DISCOVERY_REDDIT_MIN_AGE_HOURS) {
      throw new Error('DISCOVERY_REDDIT_MAX_AGE_HOURS must be greater than MIN_AGE_HOURS.');
    }
    if (isNaN(config.DISCOVERY_REDDIT_MIN_UPVOTES) || config.DISCOVERY_REDDIT_MIN_UPVOTES < 0) {
      throw new Error('DISCOVERY_REDDIT_MIN_UPVOTES must be a positive integer.');
    }
    if (isNaN(config.DISCOVERY_REDDIT_MIN_COMMENTS) || config.DISCOVERY_REDDIT_MIN_COMMENTS < 0) {
      throw new Error('DISCOVERY_REDDIT_MIN_COMMENTS must be a positive integer.');
    }
  }

  // Validate dynamic topic config
  if (isNaN(config.DISCOVERY_MAX_DYNAMIC_QUERIES_PER_RUN) || config.DISCOVERY_MAX_DYNAMIC_QUERIES_PER_RUN < 1) {
    throw new Error('DISCOVERY_MAX_DYNAMIC_QUERIES_PER_RUN must be at least 1.');
  }
  if (isNaN(config.DISCOVERY_MAX_TOPICS) || config.DISCOVERY_MAX_TOPICS < 1) {
    throw new Error('DISCOVERY_MAX_TOPICS must be at least 1.');
  }
  if (isNaN(config.DISCOVERY_TOPIC_MIN_FREQUENCY) || config.DISCOVERY_TOPIC_MIN_FREQUENCY < 1) {
    throw new Error('DISCOVERY_TOPIC_MIN_FREQUENCY must be at least 1.');
  }

  // Validate YouTube config
  if (config.DISCOVERY_YOUTUBE_SOURCE_ENABLED) {
    if (isNaN(config.YOUTUBE_LIMIT) || config.YOUTUBE_LIMIT <= 0 || config.YOUTUBE_LIMIT > 50) {
       throw new Error('YOUTUBE_LIMIT must be a positive finite integer, maximum 50 (API limit for list).');
    }
    if (isNaN(config.YOUTUBE_REQUEST_TIMEOUT_MS) || config.YOUTUBE_REQUEST_TIMEOUT_MS <= 0) {
       throw new Error('YOUTUBE_REQUEST_TIMEOUT_MS must be a positive finite number.');
    }
  }


}

export default config;
