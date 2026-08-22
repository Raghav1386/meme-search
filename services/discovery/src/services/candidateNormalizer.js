export function normalizeCandidate(rawCandidate) {
  // 1. Platform normalization
  let platform = (rawCandidate.platform || '').trim().toLowerCase();

  // 2. String normalization
  const cleanString = (str) => {
    if (typeof str !== 'string') return null;
    return str.replace(/\s+/g, ' ').trim() || null;
  };

  const platform_content_id = cleanString(rawCandidate.platform_content_id);
  const media_url = cleanString(rawCandidate.media_url);
  const source_url = cleanString(rawCandidate.source_url);
  const title = cleanString(rawCandidate.title);
  const caption = cleanString(rawCandidate.caption);
  const creator = cleanString(rawCandidate.creator);

  // 3. Candidate ID Generation
  // "Use a deterministic strategy. platform-platform_content_id"
  let candidate_id = cleanString(rawCandidate.candidate_id);
  if (!candidate_id && platform && platform_content_id) {
    candidate_id = `${platform}-${platform_content_id}`;
  }

  // 4. Timestamp normalization
  let published_at = null;
  if (rawCandidate.published_at) {
     const parsed = new Date(rawCandidate.published_at);
     if (!isNaN(parsed)) {
       published_at = parsed.toISOString();
     }
  }

  // 5. Engagement normalization
  let engagement = {};
  if (rawCandidate.engagement && typeof rawCandidate.engagement === 'object') {
     engagement = {
       views: rawCandidate.engagement.views !== undefined ? Number(rawCandidate.engagement.views) : null,
       likes: rawCandidate.engagement.likes !== undefined ? Number(rawCandidate.engagement.likes) : null,
       comments: rawCandidate.engagement.comments !== undefined ? Number(rawCandidate.engagement.comments) : null,
     };
  } else if (rawCandidate.engagement !== undefined) {
      engagement = rawCandidate.engagement; // Let validator handle invalid types
  }

  // 6. Return Normalized Object (Not yet instantiated as Candidate model to avoid constructor throws)
  return {
    candidate_id,
    platform,
    platform_content_id,
    media_url,
    source_url,
    title,
    caption,
    creator,
    published_at,
    engagement,
    discovered_at: new Date().toISOString()
  };
}
