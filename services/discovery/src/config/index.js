import dotenv from 'dotenv';
dotenv.config();

const config = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  REDIS_URL: process.env.REDIS_URL,
  DISCOVERY_ENABLED: process.env.DISCOVERY_ENABLED !== 'false',
  DISCOVERY_RUN_MODE: process.env.DISCOVERY_RUN_MODE || 'test',
  DISCOVERY_MOCK_SOURCE_ENABLED: process.env.DISCOVERY_MOCK_SOURCE_ENABLED !== 'false',
  
  // Trend Scoring
  TREND_ENGAGEMENT_WEIGHT: parseFloat(process.env.TREND_ENGAGEMENT_WEIGHT || '0.6'),
  TREND_FRESHNESS_WEIGHT: parseFloat(process.env.TREND_FRESHNESS_WEIGHT || '0.4'),
  TREND_FRESHNESS_HALFLIFE_HOURS: parseFloat(process.env.TREND_FRESHNESS_HALFLIFE_HOURS || '48'),
  
  // Filtering & Ranking
  TREND_MIN_SCORE: parseFloat(process.env.TREND_MIN_SCORE || '30'),
  TREND_MAX_CANDIDATES_PER_RUN: parseInt(process.env.TREND_MAX_CANDIDATES_PER_RUN || '100', 10),
  
  // Phase 4 - Discovery Database & Scheduler
  DISCOVERY_DATABASE_URL: process.env.DISCOVERY_DATABASE_URL,
  DISCOVERY_SCHEDULE_ENABLED: process.env.DISCOVERY_SCHEDULE_ENABLED === 'true',
  DISCOVERY_INTERVAL_MS: parseInt(process.env.DISCOVERY_INTERVAL_MS || '3600000', 10),

  // Source Configuration
  REDDIT_SOURCE_ENABLED: process.env.DISCOVERY_REDDIT_SOURCE_ENABLED === 'true',
  REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID || '',
  REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET || '',
  REDDIT_USER_AGENT: process.env.REDDIT_USER_AGENT || 'MemeSearch/1.0.0 (Node.js)',
  REDDIT_SUBREDDITS: (process.env.REDDIT_SUBREDDITS || 'memes,funny').split(',').map(s => s.trim()).filter(Boolean),
  REDDIT_LIMIT: parseInt(process.env.REDDIT_LIMIT || '25', 10),
  REDDIT_REQUEST_TIMEOUT_MS: parseInt(process.env.REDDIT_REQUEST_TIMEOUT_MS || '10000', 10),

  // YouTube Source
  DISCOVERY_YOUTUBE_SOURCE_ENABLED: process.env.DISCOVERY_YOUTUBE_SOURCE_ENABLED === 'true',
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || '',
  YOUTUBE_CHANNEL_IDS: (process.env.YOUTUBE_CHANNEL_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
  YOUTUBE_SEARCH_QUERY: process.env.YOUTUBE_SEARCH_QUERY || '',
  YOUTUBE_LIMIT: parseInt(process.env.YOUTUBE_LIMIT || '25', 10),
  YOUTUBE_REQUEST_TIMEOUT_MS: parseInt(process.env.YOUTUBE_REQUEST_TIMEOUT_MS || '10000', 10),
};

// Validate required config here
export function validateConfig() {
  const required = ['PORT', 'REDIS_URL'];
  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
  
  // Validate scoring config
  if (config.TREND_ENGAGEMENT_WEIGHT < 0 || config.TREND_FRESHNESS_WEIGHT < 0 || config.TREND_FRESHNESS_HALFLIFE_HOURS <= 0) {
     throw new Error('Trend scoring configuration must contain positive numbers.');
  }

  // Validate filtering config
  if (isNaN(config.TREND_MIN_SCORE) || config.TREND_MIN_SCORE < 0 || config.TREND_MIN_SCORE > 100) {
     throw new Error('TREND_MIN_SCORE must be a finite number between 0 and 100.');
  }
  if (isNaN(config.TREND_MAX_CANDIDATES_PER_RUN) || config.TREND_MAX_CANDIDATES_PER_RUN <= 0 || config.TREND_MAX_CANDIDATES_PER_RUN > 1000) {
     throw new Error('TREND_MAX_CANDIDATES_PER_RUN must be a positive finite integer, maximum 1000.');
  }

  // Validate Reddit config
  if (config.DISCOVERY_REDDIT_SOURCE_ENABLED) {
    if (isNaN(config.REDDIT_LIMIT) || config.REDDIT_LIMIT <= 0 || config.REDDIT_LIMIT > 100) {
       throw new Error('REDDIT_LIMIT must be a positive finite integer, maximum 100.');
    }
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
