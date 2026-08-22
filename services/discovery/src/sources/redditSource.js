import { SourceAdapter } from './sourceAdapter.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

export class RedditSourceAdapter extends SourceAdapter {
  constructor() {
    super('reddit');
    this.accessToken = null;
    this.tokenExpiration = null;
  }

  get isEnabled() {
    return config.DISCOVERY_REDDIT_SOURCE_ENABLED;
  }

  async authenticate(context) {
    if (!config.REDDIT_CLIENT_ID || !config.REDDIT_CLIENT_SECRET) {
      throw new Error("Reddit source configuration is missing client credentials.");
    }

    if (this.accessToken && this.tokenExpiration && Date.now() < this.tokenExpiration) {
      return; // Token still valid
    }

    logger.info('Reddit authentication started', { 
      discovery_run_id: context.discovery_run_id, 
      source: this.name 
    });

    const credentials = Buffer.from(`${config.REDDIT_CLIENT_ID}:${config.REDDIT_CLIENT_SECRET}`).toString('base64');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.REDDIT_REQUEST_TIMEOUT_MS);

    let response;
    try {
      response = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': config.REDDIT_USER_AGENT
        },
        body: 'grant_type=client_credentials',
        signal: controller.signal
      });
    } catch (err) {
      throw new Error(`Reddit auth network/timeout error: ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`Reddit auth failed: ${response.status} ${response.statusText}`);
    }

    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error(`Reddit auth failed: malformed JSON response`);
    }
    
    if (!data || !data.access_token) {
       throw new Error(`Reddit auth failed: invalid token response format`);
    }

    this.accessToken = data.access_token;
    // expire slightly early to avoid boundary conditions
    this.tokenExpiration = Date.now() + (data.expires_in - 60) * 1000;

    logger.info('Reddit authentication succeeded', { 
      discovery_run_id: context.discovery_run_id, 
      source: this.name 
    });
  }

  async fetchSubreddit(subreddit, context) {
    logger.info('Reddit request started', { 
      discovery_run_id: context.discovery_run_id, 
      source: this.name,
      subreddit 
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.REDDIT_REQUEST_TIMEOUT_MS);
    const startTime = Date.now();
    
    let response;
    try {
      response = await fetch(`https://oauth.reddit.com/r/${subreddit}/hot?limit=${config.REDDIT_LIMIT}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': config.REDDIT_USER_AGENT
        },
        signal: controller.signal
      });
    } catch (err) {
      throw new Error(`Reddit request network/timeout error on r/${subreddit}: ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new Error(`Reddit rate limited on r/${subreddit}${retryAfter ? ' (Retry-After: ' + retryAfter + ')' : ''}`);
    }
    
    if (!response.ok) {
      throw new Error(`Reddit request failed for r/${subreddit}: ${response.status} ${response.statusText}`);
    }

    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error(`Reddit request failed for r/${subreddit}: malformed JSON response`);
    }
    
    const durationMs = Date.now() - startTime;
    
    if (!data || typeof data !== 'object' || !data.data || !Array.isArray(data.data.children)) {
      throw new Error(`Reddit request failed for r/${subreddit}: missing expected children array in response`);
    }
    
    const posts = data.data.children;

    logger.info('Reddit request completed', {
      discovery_run_id: context.discovery_run_id,
      source: this.name,
      subreddit,
      duration_ms: durationMs,
      received_count: posts.length,
      status: 'success'
    });

    const rawCandidates = [];
    
    for (const postWrapper of posts) {
      if (!postWrapper || typeof postWrapper !== 'object' || !postWrapper.data) continue;
      const post = postWrapper.data;

      // Extract safest representation of media url
      const media_url = post.url_overridden_by_dest || post.url || null;

      // Engagement safety
      const ups = typeof post.ups === 'number' && !isNaN(post.ups) ? post.ups : 0;
      const comments = typeof post.num_comments === 'number' && !isNaN(post.num_comments) ? post.num_comments : 0;

      rawCandidates.push({
        platform: 'reddit',
        platform_content_id: post.id || null, // Normalizer/Validator will catch null IDs
        media_url: media_url,
        title: post.title || '',
        caption: post.selftext || '',
        published_at: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
        engagement: {
          likes: ups,
          comments: comments
        },
        metadata: {
          subreddit: post.subreddit || subreddit,
          author: post.author || '',
          is_video: post.is_video || false,
          domain: post.domain || ''
        }
      });
    }

    return rawCandidates;
  }

  async fetch(context) {
    // 1. Authenticate
    await this.authenticate(context);

    // 2. Fetch from configured subreddits
    const allCandidates = [];

    for (const subreddit of config.REDDIT_SUBREDDITS) {
      try {
        const raw = await this.fetchSubreddit(subreddit, context);
        allCandidates.push(...raw);
      } catch (err) {
        // Isolate failures to the specific subreddit so others can continue
        logger.error('Reddit subreddit request failed', {
          discovery_run_id: context.discovery_run_id,
          source: this.name,
          subreddit,
          error: err.message
        });
      }
    }

    if (allCandidates.length === 0 && config.REDDIT_SUBREDDITS.length > 0) {
      // If all subreddits failed, bubble up the failure so SourceManager marks the source as failed
      throw new Error("All requested subreddits failed to fetch candidates");
    }

    logger.info('Reddit source completed', {
      discovery_run_id: context.discovery_run_id,
      source: this.name,
      total_received: allCandidates.length,
      subreddits_processed: config.REDDIT_SUBREDDITS.length
    });

    return allCandidates;
  }
}
