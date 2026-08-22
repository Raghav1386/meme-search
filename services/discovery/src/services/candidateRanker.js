export function rankCandidates(candidates) {
  // Create a shallow copy to avoid unexpected mutation of the original array order elsewhere
  const ranked = [...candidates];

  ranked.sort((a, b) => {
    // 1. Primary rule: trend_score DESCENDING
    const scoreDiff = b.trend_score - a.trend_score;
    if (scoreDiff !== 0) return scoreDiff;

    // 2. Secondary rule: published_at DESCENDING (newer first)
    // Handle safely if published_at is missing or invalid
    const timeA = a.published_at ? new Date(a.published_at).getTime() : 0;
    const timeB = b.published_at ? new Date(b.published_at).getTime() : 0;

    const validTimeA = isNaN(timeA) ? 0 : timeA;
    const validTimeB = isNaN(timeB) ? 0 : timeB;

    const timeDiff = validTimeB - validTimeA;
    if (timeDiff !== 0) return timeDiff;

    // 3. Final fallback: candidate_id ASCENDING (deterministic tie-breaker)
    if (a.candidate_id < b.candidate_id) return -1;
    if (a.candidate_id > b.candidate_id) return 1;
    
    return 0; // Should never happen unless exact same candidate bypassed Set deduplication
  });

  return ranked;
}
