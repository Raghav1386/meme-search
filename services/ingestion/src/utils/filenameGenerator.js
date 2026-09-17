import crypto from 'crypto';

/**
 * Sanitizes a caption into a safe, human-readable filename base.
 * @param {string} caption 
 * @returns {string}
 */
export function sanitizeCaption(caption) {
  if (!caption || typeof caption !== 'string') {
    return '';
  }

  // Convert to lowercase
  let sanitized = caption.toLowerCase();

  // Replace invalid filesystem characters, punctuation, and emojis with spaces
  // Allows a-z, 0-9. Replaces everything else with space.
  sanitized = sanitized.replace(/[^a-z0-9]/g, ' ');

  // Replace multiple spaces with a single underscore
  sanitized = sanitized.trim().replace(/\s+/g, '_');

  // Truncate if too long (e.g., max 100 characters to leave room for hash and extension)
  if (sanitized.length > 100) {
    sanitized = sanitized.substring(0, 100).replace(/_$/, '');
  }

  return sanitized;
}

/**
 * Generates a deterministic filename for a candidate.
 * If the caption is empty/invalid, it uses a fallback.
 * Always includes a short hash to prevent collisions.
 * 
 * @param {string} caption - The original meme caption
 * @param {string} candidateId - The unique candidate ID (e.g., reddit_xxx)
 * @param {string} extension - The file extension (e.g., 'jpg', 'png')
 * @param {string} sha256 - (Optional) original file sha256, used for hashing if available
 * @returns {string} The final filename like `when_the_code_works-a83f91c2.jpg`
 */
export function generateFilename(caption, candidateId, extension, sha256 = null) {
  // Normalize extension
  const ext = extension.startsWith('.') ? extension : `.${extension}`;

  const sanitized = sanitizeCaption(caption);
  
  // Create a short hash to ensure uniqueness even if captions are identical
  const hashSource = sha256 || candidateId || crypto.randomUUID();
  const shortHash = crypto.createHash('sha256').update(hashSource).digest('hex').substring(0, 8);

  if (!sanitized) {
    return `untitled_meme_${candidateId}${ext}`;
  }

  return `${sanitized}-${shortHash}${ext}`;
}
