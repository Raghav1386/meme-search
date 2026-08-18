/**
 * Shared Candidate Contract
 * Defines the structural metadata for a meme candidate flowing from Discovery to Ingestion.
 */
export class Candidate {
  constructor(data) {
    if (!data.candidate_id || !data.platform || !data.media_url) {
      throw new Error("Missing required Candidate fields: candidate_id, platform, media_url");
    }

    // --- REQUIRED FIELDS ---
    // Unique identifier (e.g., hash of URL or original post ID)
    this.candidate_id = data.candidate_id; 
    // The source platform ('reddit', 'youtube', etc.)
    this.platform = data.platform;         
    // The direct URL to download the actual media
    this.media_url = data.media_url;       
    // When the Discovery Service found this candidate
    this.discovered_at = data.discovered_at || new Date().toISOString();
    
    // --- OPTIONAL FIELDS ---
    // Original post/video ID on the platform
    this.platform_content_id = data.platform_content_id || null;
    // Link to the original post/context
    this.source_url = data.source_url || null; 
    // Any extracted text, title, or caption
    this.caption = data.caption || null;
    this.title = data.title || null;
    // The creator/channel/user who posted it
    this.creator = data.creator || null;
    // When it was originally published on the platform
    this.published_at = data.published_at || null;
    // Platform-specific engagement metrics
    this.engagement = data.engagement || {}; 
    // Computed trend score
    this.trend_score = data.trend_score || 0;
    // Final priority score for ingestion queue
    this.discovery_score = data.discovery_score || 0;
  }
}
