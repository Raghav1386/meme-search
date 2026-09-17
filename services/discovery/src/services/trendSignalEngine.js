import config from '../config/index.js';

function safeLogNorm(val, maxLog) {
  if (typeof val !== 'number' || isNaN(val) || !isFinite(val) || val < 0) return 0;
  const logValue = Math.log10(val + 1);
  return Math.max(0, Math.min(logValue / maxLog, 1.0));
}

export function calculateFreshness(candidate, referenceTimeMs = Date.now()) {
  if (!candidate.published_at) return null;
  const pubDate = new Date(candidate.published_at);
  if (isNaN(pubDate)) return null;

  let ageHours = (referenceTimeMs - pubDate.getTime()) / (1000 * 60 * 60);
  if (ageHours < 0) ageHours = 0;

  const decayConstant = config.TREND_FRESHNESS_DECAY_HOURS;
  const freshness = Math.exp(-ageHours / decayConstant);
  return Math.max(0, Math.min(freshness, 1.0));
}

export function calculateEngagement(candidate) {
  if (!candidate.engagement) return null;
  let totalNorm = 0;
  let weights = 0;

  if (typeof candidate.engagement.likes === 'number' && candidate.engagement.likes >= 0) {
    totalNorm += safeLogNorm(candidate.engagement.likes, 7) * 1.0;
    weights += 1.0;
  }
  if (typeof candidate.engagement.comments === 'number' && candidate.engagement.comments >= 0) {
    totalNorm += safeLogNorm(candidate.engagement.comments, 6) * 1.5;
    weights += 1.5;
  }
  
  if (weights === 0) return null;
  return totalNorm / weights;
}

export function calculatePopularity(candidate) {
  if (!candidate.engagement) return null;
  
  // True popularity = reach (views)
  if (typeof candidate.engagement.views === 'number' && candidate.engagement.views >= 0) {
    return safeLogNorm(candidate.engagement.views, 9);
  }
  
  // Fallback to likes as a proxy for popularity if views are not available
  if (typeof candidate.engagement.likes === 'number' && candidate.engagement.likes >= 0) {
    return safeLogNorm(candidate.engagement.likes, 8);
  }
  
  return null;
}

export function calculateVelocity(candidate, referenceTimeMs = Date.now()) {
  if (!candidate.published_at || !candidate.engagement) return null;
  const pubDate = new Date(candidate.published_at);
  if (isNaN(pubDate)) return null;

  let ageHours = (referenceTimeMs - pubDate.getTime()) / (1000 * 60 * 60);
  if (ageHours < 0) ageHours = 0;
  
  const effectiveAge = Math.max(ageHours, config.TREND_VELOCITY_MIN_AGE_HOURS);
  
  let totalInteractions = 0;
  if (typeof candidate.engagement.likes === 'number' && candidate.engagement.likes >= 0) totalInteractions += candidate.engagement.likes;
  if (typeof candidate.engagement.comments === 'number' && candidate.engagement.comments >= 0) totalInteractions += candidate.engagement.comments;
  
  if (totalInteractions === 0) return 0;
  
  const velocity = totalInteractions / effectiveAge;
  
  // Log normalize velocity: Max expectation is e.g. 1M interactions per hour (log10(1M) = 6)
  return safeLogNorm(velocity, 6);
}

export function calculateSourceStrength(candidate) {
  const platform = (candidate.platform || '').toLowerCase();
  switch (platform) {
    case 'reddit': return 0.8;
    case 'youtube': return 0.9;
    default: return 0.5;
  }
}
