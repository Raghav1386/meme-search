import config from '../config/index.js';

export function filterCandidate(candidate) {
  // Check if trend_score is present, numeric, finite, and not negative
  if (
    candidate.trend_score === undefined ||
    candidate.trend_score === null ||
    typeof candidate.trend_score !== 'number' ||
    isNaN(candidate.trend_score) ||
    !isFinite(candidate.trend_score) ||
    candidate.trend_score < 0
  ) {
    return {
      passed: false,
      reason: 'invalid_trend_score'
    };
  }

  // Check against minimum configuration threshold
  if (candidate.trend_score < config.TREND_MIN_SCORE) {
    return {
      passed: false,
      reason: 'below_min_trend_score'
    };
  }

  return {
    passed: true,
    reason: null
  };
}
