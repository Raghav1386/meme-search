export function validateCandidate(normalized) {
  const result = {
    valid: true,
    errors: [],
    warnings: []
  };

  // ERROR: Check required base fields
  if (!normalized.platform) {
    result.valid = false;
    result.errors.push('Missing platform');
  } else if (!['reddit', 'youtube', 'mock'].includes(normalized.platform)) {
    result.valid = false;
    result.errors.push(`Unsupported platform: ${normalized.platform}`);
  }

  // ERROR: Content ID
  if (!normalized.platform_content_id) {
    result.valid = false;
    result.errors.push('Missing platform_content_id');
  }

  // ERROR: Candidate ID
  if (!normalized.candidate_id) {
    result.valid = false;
    result.errors.push('Missing candidate_id (could not be deterministically generated)');
  }

  // Helper for URLs
  const isValidUrl = (s) => {
    try { new URL(s); return true; } catch (e) { return false; }
  };

  // ERROR: Media URL
  if (!normalized.media_url) {
    result.valid = false;
    result.errors.push('Missing required media_url');
  } else if (!isValidUrl(normalized.media_url)) {
    result.valid = false;
    result.errors.push('Invalid media_url format');
  }

  // ERROR: Source URL (If provided, must be valid)
  if (normalized.source_url && !isValidUrl(normalized.source_url)) {
    result.valid = false;
    result.errors.push('Invalid source_url format');
  }

  // ERROR: Engagement Type
  if (normalized.engagement !== null && normalized.engagement !== undefined && typeof normalized.engagement !== 'object') {
     result.valid = false;
     result.errors.push('Invalid engagement type. Must be an object.');
  }

  // WARNING: Optional metadata missing
  if (!normalized.title && !normalized.caption) {
    result.warnings.push('Missing both title and caption (optional but recommended)');
  }
  
  if (!normalized.creator) {
    result.warnings.push('Missing creator (optional)');
  }

  return result;
}
