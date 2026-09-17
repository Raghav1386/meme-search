import logger from '../utils/logger.js';

/**
 * Minimal abstraction for media acquisition during Discovery duplicate detection.
 * Does not implement platform-specific downloaders (yt-dlp, Reddit API), but
 * fetches raw bytes from a direct media URL with basic timeouts.
 *
 * @param {string} url - The direct media URL to fetch.
 * @returns {Promise<Buffer>} - The downloaded media bytes.
 * @throws {Error} - If download fails or times out.
 */
export async function fetchMediaBytes(url) {
  if (!url) throw new Error('fetchMediaBytes: URL is required');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15 seconds

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    logger.warn('Failed to fetch media bytes', { url, error: err.message });
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
