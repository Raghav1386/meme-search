import config from '../config/index.js';

export function filterCandidate(candidate) {
  const threshold = config.TREND_MIN_SCORE;
  const trend_score = candidate.trend_score;

  // Check if trend_score is present, numeric, finite, not negative, and not > 100
  if (
    trend_score === undefined ||
    trend_score === null ||
    typeof trend_score !== 'number' ||
    isNaN(trend_score) ||
    !isFinite(trend_score) ||
    trend_score < 0 ||
    trend_score > 100
  ) {
    return {
      accepted: false,
      reason: 'invalid_trend_score',
      trend_score,
      threshold
    };
  }

  // Check 72-hour rolling window
  if (candidate.published_at) {
    const ageMs = Date.now() - new Date(candidate.published_at).getTime();
    const maxAgeMs = config.DISCOVERY_REDDIT_BACKFILL_HOURS * 3600 * 1000;
    if (ageMs > maxAgeMs) {
       return {
         accepted: false,
         reason: 'expired_recent_window',
         trend_score,
         threshold
       };
    }
  }

  // Early Media Filtering (Image-Only Enforcement)
  if (config.DISCOVERY_IMAGE_ONLY) {
    const mediaType = candidate.metadata?.media_type || 'unknown';
    if (mediaType === 'video') {
       return { accepted: false, reason: 'media_type_video', trend_score, threshold };
    }
    if (mediaType === 'audio') {
       return { accepted: false, reason: 'media_type_audio', trend_score, threshold };
    }
    if (mediaType === 'text') {
       return { accepted: false, reason: 'media_type_text', trend_score, threshold };
    }
    if (candidate.platform === 'youtube') {
       return { accepted: false, reason: 'media_type_video', trend_score, threshold };
    }
  } else {
    // Old logic fallback
    if (candidate.metadata && candidate.metadata.is_video === true) {
       return { accepted: false, reason: 'unsupported_media_video', trend_score, threshold };
    }
  }

  // Check against minimum configuration threshold
  if (trend_score < threshold) {
    return {
      accepted: false,
      reason: 'trend_score_below_threshold',
      trend_score,
      threshold
    };
  }

  return {
    accepted: true,
    reason: 'trend_score_above_threshold',
    trend_score,
    threshold
  };
}
