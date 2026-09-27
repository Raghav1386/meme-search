import config from '../config/index.js';

export function filterCandidate(candidate) {
  const threshold = config.TREND_MIN_SCORE;
  const trend_score = candidate.trend_score;

  // Score validity check removed per user request. We accept all memes.

  // Check 72-hour rolling window (REMOVED PER USER REQUEST)
  // We no longer reject based on age.

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

  // Check against minimum configuration threshold (REMOVED PER USER REQUEST)
  // We no longer reject based on trend score.

  return {
    accepted: true,
    reason: 'trend_score_above_threshold',
    trend_score,
    threshold
  };
}
