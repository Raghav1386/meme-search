export function rankCandidates(candidates) {
  // Create a shallow copy to avoid unexpected mutation of the original array order elsewhere
  const ranked = [...candidates];

  ranked.sort((a, b) => {
    // 1. Primary rule: Engagement (Upvotes) DESCENDING
    const likesA = (a.engagement && typeof a.engagement.likes === 'number') ? a.engagement.likes : 0;
    const likesB = (b.engagement && typeof b.engagement.likes === 'number') ? b.engagement.likes : 0;
    const likesDiff = likesB - likesA;
    if (likesDiff !== 0) return likesDiff;

    // 2. Secondary rule: Engagement (Comments) DESCENDING
    const commentsA = (a.engagement && typeof a.engagement.comments === 'number') ? a.engagement.comments : 0;
    const commentsB = (b.engagement && typeof b.engagement.comments === 'number') ? b.engagement.comments : 0;
    const commentsDiff = commentsB - commentsA;
    if (commentsDiff !== 0) return commentsDiff;

    // 3. Tertiary rule: trend_score DESCENDING
    const scoreDiff = (b.trend_score || 0) - (a.trend_score || 0);
    if (scoreDiff !== 0) return scoreDiff;

    // 4. Quaternary rule: published_at DESCENDING (newer first)
    const timeA = a.published_at ? new Date(a.published_at).getTime() : 0;
    const timeB = b.published_at ? new Date(b.published_at).getTime() : 0;
    const validTimeA = isNaN(timeA) ? 0 : timeA;
    const validTimeB = isNaN(timeB) ? 0 : timeB;
    const timeDiff = validTimeB - validTimeA;
    if (timeDiff !== 0) return timeDiff;

    // 5. Final fallback: candidate_id ASCENDING (deterministic tie-breaker)
    if (a.candidate_id < b.candidate_id) return -1;
    if (a.candidate_id > b.candidate_id) return 1;
    
    return 0; // Should never happen unless exact same candidate bypassed Set deduplication
  });

  return ranked;
}
