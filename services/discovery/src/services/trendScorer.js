import config from '../config/index.js';
import {
  calculateFreshness,
  calculateEngagement,
  calculatePopularity,
  calculateVelocity,
  calculateSourceStrength
} from './trendSignalEngine.js';

function classifyScore(score) {
  if (score < 25) return 'low';
  if (score < 50) return 'moderate';
  if (score < 75) return 'high';
  return 'very_high';
}

export function scoreCandidate(candidate, referenceTimeMs = Date.now()) {
  const breakdown = {
    freshness: null,
    engagement: null,
    engagement_velocity: null,
    popularity: null,
    source_strength: null
  };

  const weights = {
    freshness: config.TREND_WEIGHT_FRESHNESS,
    engagement: config.TREND_WEIGHT_ENGAGEMENT,
    engagement_velocity: config.TREND_WEIGHT_VELOCITY,
    popularity: config.TREND_WEIGHT_POPULARITY,
    source_strength: config.TREND_WEIGHT_SOURCE
  };

  try {
    // 1. Compute Signals
    breakdown.freshness = calculateFreshness(candidate, referenceTimeMs);
    breakdown.engagement = calculateEngagement(candidate);
    breakdown.engagement_velocity = calculateVelocity(candidate, referenceTimeMs);
    breakdown.popularity = calculatePopularity(candidate);
    breakdown.source_strength = calculateSourceStrength(candidate);

    // 2. Renormalize weights for missing signals
    let totalAvailableWeight = 0;
    let weightedSum = 0;

    for (const [key, signal] of Object.entries(breakdown)) {
      if (signal !== null) {
        // Clamp signal defensively just in case engine fails
        const clampedSignal = Math.max(0, Math.min(signal, 1.0));
        weightedSum += clampedSignal * weights[key];
        totalAvailableWeight += weights[key];
      }
    }

    // 3. Final Score
    let finalScore = 0;
    if (totalAvailableWeight > 0) {
      finalScore = (weightedSum / totalAvailableWeight) * 100;
    }

    // Clamp score 0-100 and round to 2 decimals
    finalScore = Math.max(0, Math.min(100, finalScore));
    const trend_score = Math.round(finalScore * 100) / 100;

    return {
      trend_score,
      classification: classifyScore(trend_score),
      components: {
        signals: breakdown,
        weights: weights
      }
    };

  } catch (e) {
    return {
      trend_score: 0,
      classification: 'low',
      components: {
        signals: breakdown,
        weights: weights,
        error: e.message
      }
    };
  }
}
