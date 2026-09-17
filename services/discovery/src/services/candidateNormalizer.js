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

  // 6. Metadata and Media Type Classification
  const metadata = rawCandidate.metadata || {};
  let media_type = 'unknown';

  if (platform === 'youtube') {
    media_type = 'video';
  } else if (platform === 'reddit') {
    if (metadata.is_video || metadata.post_hint === 'hosted:video' || metadata.post_hint === 'rich:video') {
      media_type = 'video';
    } else if (metadata.is_self) {
      media_type = 'text';
    } else if (metadata.post_hint === 'image') {
      media_type = 'image';
    } else if (metadata.domain) {
      const d = metadata.domain.toLowerCase();
      if (d.includes('youtube.com') || d.includes('youtu.be') || d.includes('v.redd.it')) {
         media_type = 'video';
      } else if (d.includes('spotify.com') || d.includes('soundcloud.com')) {
         media_type = 'audio';
      }
    }
    
    // Check extensions as fallback
    if (media_url && media_type === 'unknown') {
      const lowUrl = media_url.toLowerCase();
      if (/\.(mp4|webm|mov|avi|mkv|mpeg)($|\?)/.test(lowUrl)) media_type = 'video';
      else if (/\.(mp3|wav|ogg|flac|m4a)($|\?)/.test(lowUrl)) media_type = 'audio';
      else if (/\.(jpg|jpeg|png|webp|gif)($|\?)/.test(lowUrl)) media_type = 'image';
    }
  }

  metadata.media_type = media_type;
  metadata.engagement = engagement;

  // 7. Return Normalized Object
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
    metadata,
    discovered_at: new Date().toISOString()
  };
}
