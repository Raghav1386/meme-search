import { SourceAdapter } from './sourceAdapter.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

export class YouTubeSourceAdapter extends SourceAdapter {
  constructor() {
    super('youtube');
  }

  get isEnabled() {
    return config.DISCOVERY_YOUTUBE_SOURCE_ENABLED;
  }

  // Helper to ensure API key never leaks in thrown error messages
  _sanitizeError(message) {
    if (!message) return 'Unknown error';
    if (config.YOUTUBE_API_KEY) {
      return message.split(config.YOUTUBE_API_KEY).join('[REDACTED]');
    }
    return message;
  }

  async makeApiRequest(url, context, operationContext) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.YOUTUBE_REQUEST_TIMEOUT_MS);
    const startTime = Date.now();

    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (err) {
      throw new Error(this._sanitizeError(`YouTube network/timeout error during ${operationContext}: ${err.message}`));
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 403) {
      throw new Error(`YouTube API quota/authorization error (403) during ${operationContext}`);
    }

    if (!response.ok) {
      throw new Error(this._sanitizeError(`YouTube API request failed (HTTP ${response.status}) during ${operationContext}`));
    }

    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error(`YouTube malformed JSON response during ${operationContext}`);
    }

    return { data, durationMs: Date.now() - startTime };
  }

  async fetchVideoDetails(videoIds, context) {
    if (!videoIds || videoIds.length === 0) return [];
    
    const idsString = videoIds.join(',');
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${idsString}&key=${config.YOUTUBE_API_KEY}`;
    
    const { data } = await this.makeApiRequest(url, context, 'video details fetch');
    
    if (!data || !Array.isArray(data.items)) {
      throw new Error("YouTube videos response missing items array");
    }
    return data.items;
  }

  _parseEngagement(val) {
    if (typeof val === 'undefined' || val === null) return 0;
    const num = parseInt(val, 10);
    if (isNaN(num) || !isFinite(num) || num < 0) return 0;
    return num;
  }

  mapToCandidates(videos, context) {
    const rawCandidates = [];
    
    for (const video of videos) {
      if (!video || typeof video !== 'object' || !video.id || !video.snippet) continue;

      const media_url = `https://www.youtube.com/watch?v=${video.id}`;
      const stats = video.statistics || {};

      const views = this._parseEngagement(stats.viewCount);
      const likes = this._parseEngagement(stats.likeCount);
      const comments = this._parseEngagement(stats.commentCount);

      rawCandidates.push({
        platform: 'youtube',
        platform_content_id: video.id,
        media_url: media_url,
        title: video.snippet.title || '',
        caption: video.snippet.description || '',
        published_at: video.snippet.publishedAt ? new Date(video.snippet.publishedAt).toISOString() : null,
        engagement: {
          views,
          likes,
          comments
        },
        metadata: {
          channel_id: video.snippet.channelId || '',
          channel_title: video.snippet.channelTitle || '',
          category_id: video.snippet.categoryId || '',
          duration: video.contentDetails?.duration || '',
          definition: video.contentDetails?.definition || '',
          dimension: video.contentDetails?.dimension || ''
        }
      });
    }

    return rawCandidates;
  }

  async fetchForChannel(channelId, context) {
    logger.info('YouTube request started', { 
      discovery_run_id: context.discovery_run_id, 
      source: this.name,
      operation: 'channel_search',
      channel_id: channelId 
    });

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=${config.YOUTUBE_LIMIT}&key=${config.YOUTUBE_API_KEY}`;
    
    const { data, durationMs } = await this.makeApiRequest(url, context, `channel search (${channelId})`);

    if (!data || !Array.isArray(data.items)) {
      throw new Error(`YouTube channel search response missing items array for channel ${channelId}`);
    }

    const videoIds = data.items.map(item => item.id?.videoId).filter(Boolean);
    const videos = await this.fetchVideoDetails(videoIds, context);
    
    logger.info('YouTube request completed', {
      discovery_run_id: context.discovery_run_id,
      source: this.name,
      operation: 'channel_search',
      channel_id: channelId,
      duration_ms: durationMs,
      received_count: videos.length,
      status: 'success'
    });

    return this.mapToCandidates(videos, context);
  }

  async fetchForQuery(query, context) {
    logger.info('YouTube request started', { 
      discovery_run_id: context.discovery_run_id, 
      source: this.name,
      operation: 'query_search',
      query: query 
    });

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&order=date&maxResults=${config.YOUTUBE_LIMIT}&key=${config.YOUTUBE_API_KEY}`;
    
    const { data, durationMs } = await this.makeApiRequest(url, context, 'query search');

    if (!data || !Array.isArray(data.items)) {
      throw new Error(`YouTube query search response missing items array`);
    }

    const videoIds = data.items.map(item => item.id?.videoId).filter(Boolean);
    const videos = await this.fetchVideoDetails(videoIds, context);
    
    logger.info('YouTube request completed', {
      discovery_run_id: context.discovery_run_id,
      source: this.name,
      operation: 'query_search',
      duration_ms: durationMs,
      received_count: videos.length,
      status: 'success'
    });

    return this.mapToCandidates(videos, context);
  }

  async fetch(context) {
    if (!config.YOUTUBE_API_KEY) {
      throw new Error("YouTube source configuration is missing API key.");
    }

    logger.info('YouTube source execution started', { discovery_run_id: context.discovery_run_id });

    const allCandidates = [];
    
    if (config.YOUTUBE_CHANNEL_IDS && config.YOUTUBE_CHANNEL_IDS.length > 0) {
      // Channel Mode
      for (const channelId of config.YOUTUBE_CHANNEL_IDS) {
        try {
          const raw = await this.fetchForChannel(channelId, context);
          allCandidates.push(...raw);
        } catch (err) {
          logger.error('YouTube request failed', {
            discovery_run_id: context.discovery_run_id,
            source: this.name,
            operation: 'channel_search',
            channel_id: channelId,
            error: err.message
          });
        }
      }
      
      if (allCandidates.length === 0 && config.YOUTUBE_CHANNEL_IDS.length > 0) {
        throw new Error("All requested YouTube channels failed to fetch candidates");
      }
    } else if (config.YOUTUBE_SEARCH_QUERY) {
      // Query Mode
      try {
        const raw = await this.fetchForQuery(config.YOUTUBE_SEARCH_QUERY, context);
        allCandidates.push(...raw);
      } catch (err) {
        logger.error('YouTube request failed', {
          discovery_run_id: context.discovery_run_id,
          source: this.name,
          operation: 'query_search',
          error: err.message
        });
        throw new Error("YouTube search query failed to fetch candidates");
      }
    } else {
      logger.info('YouTube source skipped: neither channels nor search query configured', { 
        discovery_run_id: context.discovery_run_id,
        source: this.name
      });
    }

    logger.info('YouTube source completed', {
      discovery_run_id: context.discovery_run_id,
      source: this.name,
      total_received: allCandidates.length
    });

    return allCandidates;
  }
}
