import config from '../config/index.js';
import logger from '../utils/logger.js';

export function filterRedditCandidate(candidate) {
  // Only filter Reddit candidates
  if (candidate.platform !== 'reddit') {
    return { accepted: true, reason: 'not_reddit' };
  }

  // 1. Age Filter
  let age_hours = null;
  if (!candidate.published_at) {
    return {
      accepted: false,
      reason: 'invalid_created_at',
      message: 'Missing or malformed published_at timestamp'
    };
  }

  const publishedTime = new Date(candidate.published_at).getTime();
  if (isNaN(publishedTime)) {
    return {
      accepted: false,
      reason: 'invalid_created_at',
      message: 'Timestamp could not be parsed'
    };
  }

  age_hours = (Date.now() - publishedTime) / (1000 * 60 * 60);

  // Age filter removed per user request to allow 80-90% of memes to pass
  // 2. Engagement Filter (Removed)
  // We no longer hard-reject candidates for low upvotes/comments.
  // Instead, low engagement candidates remain eligible and are ranked lower
  // by candidateRanker.js, ensuring a broad candidate pool.

  const likes = (candidate.engagement && typeof candidate.engagement.likes === 'number') ? candidate.engagement.likes : 0;
  const comments = (candidate.engagement && typeof candidate.engagement.comments === 'number') ? candidate.engagement.comments : 0;


  // 3. Media Quality Filter
  const mediaType = candidate.metadata?.media_type || 'unknown';
  
  if (!candidate.media_url) {
    return {
      accepted: false,
      reason: 'reddit_missing_media_url'
    };
  }

  if (mediaType === 'text') {
    return {
      accepted: false,
      reason: 'reddit_text_only'
    };
  }

  if (mediaType === 'video' || mediaType === 'audio') {
    return {
      accepted: false,
      reason: 'reddit_unsupported_media'
    };
  }

  return {
    accepted: true,
    reason: 'reddit_quality_passed',
    age_hours,
    upvotes: likes,
    comments: comments
  };
}
