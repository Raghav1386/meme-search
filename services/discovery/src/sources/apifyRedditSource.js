import { ApifyClient } from 'apify-client';
import { SourceAdapter } from './sourceAdapter.js';
import { ApifyBudgetManager } from '../services/apifyBudgetManager.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

export class ApifyRedditSourceAdapter extends SourceAdapter {
  constructor() {
    super('apify_reddit');
    // Lazy initialize client so it doesn't crash on boot if token is missing
    this.client = null;
  }

  get isEnabled() {
    return config.DISCOVERY_APIFY_REDDIT_ENABLED === true;
  }

  _getClient() {
    if (!this.client) {
      this.client = new ApifyClient({
        token: config.APIFY_API_TOKEN,
      });
    }
    return this.client;
  }

  async fetch(context) {
    const discoveryRunId = context.discovery_run_id;
    let queries = context.queries || [];
    
    // Backward compatibility with single manual query
    if (context.query && !queries.includes(context.query)) {
      queries.push(context.query);
    }

    if (!queries || queries.length === 0) {
      logger.info('ApifyRedditSource: No queries provided in context, skipping execution', {
        discovery_run_id: discoveryRunId
      });
      return { status: 'SUCCESS_EMPTY', receivedCount: 0, candidates: [], reason: 'No queries provided' };
    }

    // 1. Budget & Configuration Check
    try {
      await ApifyBudgetManager.checkCanRun();
    } catch (err) {
      return { status: 'LOCAL_BUDGET_BLOCKED', receivedCount: 0, candidates: [], reason: err.message, retryable: false };
    }

    const client = this._getClient();
    const actorId = config.APIFY_REDDIT_ACTOR;

    logger.info('ApifyRedditSource: Starting Apify Actor', {
      discovery_run_id: discoveryRunId,
      actor_id: actorId,
      queries: queries
    });

    const input = {
      searchTerms: queries,
      type: "post",
      sort: "top",
      time: "week",
      maxPostsCount: config.DISCOVERY_REDDIT_COLLECTION_LIMIT || 100,
      // Ensure we don't fetch unrelated content
      searchPosts: true,
      searchComments: false,
      searchCommunities: false,
      searchUsers: false,
      skipComments: true
    };

    let runResult;
    try {
      // 2. Start Actor and wait for finish
      runResult = await client.actor(actorId).call(input);
    } catch (err) {
      // Differentiate errors (Timeout vs Auth vs Network)
      if (err.message && err.message.includes('401')) {
         return { status: 'AUTHENTICATION_FAILED', receivedCount: 0, candidates: [], reason: `Apify Authentication failed: Invalid APIFY_API_TOKEN` };
      }
      return { status: 'ACTOR_FAILED', receivedCount: 0, candidates: [], reason: `Apify Actor execution failed: ${err.message}` };
    }

    const apifyRunId = runResult.id;
    const datasetId = runResult.defaultDatasetId;
    const status = runResult.status;

    let finalStatus = 'SUCCESS_WITH_DATA';
    let isPartial = false;
    let chargeLimitReached = false;

    if (runResult.statusMessage && runResult.statusMessage.includes('charge limit')) {
      logger.error('ApifyRedditSource: Apify charge limit reached', {
        discovery_run_id: discoveryRunId,
        apify_run_id: apifyRunId,
        message: runResult.statusMessage
      });
      ApifyBudgetManager.markExhausted('Apify charge limit reached');
      finalStatus = 'CHARGE_LIMIT_REACHED_PARTIAL';
      isPartial = true;
      chargeLimitReached = true;
    } else if (status !== 'SUCCEEDED') {
      finalStatus = 'ACTOR_FAILED_PARTIAL';
      isPartial = true;
    }

    if (!datasetId) {
      // No dataset to recover from
      if (chargeLimitReached) {
        return {
          status: 'CHARGE_LIMIT_REACHED',
          receivedCount: 0,
          candidates: [],
          apifyRunId,
          reason: runResult.statusMessage || 'APIFY_CHARGE_LIMIT_REACHED',
          retryable: false,
          accountActionRequired: true
        };
      } else if (isPartial) {
        return { status: 'ACTOR_FAILED', receivedCount: 0, candidates: [], apifyRunId, reason: `Apify Actor aborted or failed with status: ${status}` };
      }
      return { status: 'SUCCESS_EMPTY', receivedCount: 0, candidates: [], apifyRunId, reason: 'No dataset returned' };
    }

    if (isPartial) {
       logger.info(`ApifyRedditSource: Run ended with ${status}, attempting partial dataset recovery`, {
          discovery_run_id: discoveryRunId,
          apify_run_id: apifyRunId,
          dataset_id: datasetId
       });
    } else {
       logger.info('ApifyRedditSource: Actor completed successfully', {
         discovery_run_id: discoveryRunId,
         apify_run_id: apifyRunId,
         dataset_id: datasetId,
         status: status
       });
    }

    // 3. Fetch Dataset
    let datasetItems = [];
    try {
      const dataset = await client.dataset(datasetId).listItems();
      datasetItems = dataset.items || [];
    } catch (err) {
      if (chargeLimitReached) {
         return {
           status: 'CHARGE_LIMIT_REACHED',
           receivedCount: 0,
           candidates: [],
           apifyRunId,
           datasetId,
           reason: 'Partial dataset recovery failed',
           retryable: false,
           accountActionRequired: true
         };
      }
      return { status: 'DATASET_READ_FAILED', receivedCount: 0, candidates: [], apifyRunId, datasetId, reason: `Failed to retrieve dataset items from Apify: ${err.message}` };
    }

    ApifyBudgetManager.recordRunUsage(discoveryRunId, actorId, datasetId, datasetItems.length);

    if (datasetItems.length === 0) {
      if (chargeLimitReached) {
        return { status: 'CHARGE_LIMIT_REACHED', receivedCount: 0, candidates: [], apifyRunId, datasetId, reason: 'Dataset empty', retryable: false, accountActionRequired: true };
      }
      if (isPartial) {
        return { status: 'ACTOR_FAILED', receivedCount: 0, candidates: [], apifyRunId, datasetId, reason: `Dataset empty for failed actor ${status}` };
      }
      logger.info('ApifyRedditSource: Dataset is genuinely empty', {
        discovery_run_id: discoveryRunId,
        apify_run_id: apifyRunId
      });
      return { status: 'SUCCESS_EMPTY', receivedCount: 0, candidates: [], apifyRunId, datasetId, reason: 'Dataset empty' };
    }

    if (isPartial) {
       logger.info('ApifyRedditSource: Partial dataset recovery successful', {
          discovery_run_id: discoveryRunId,
          apify_run_id: apifyRunId,
          dataset_id: datasetId,
          received: datasetItems.length
       });
    }

    // 4. Map Dataset Items to Raw Candidates
    const rawCandidates = [];
    let ignoredCount = 0;

    for (const item of datasetItems) {
      // Ignore if it's not a post (e.g. if the actor returned users or communities by accident)
      if (item.dataType !== 'post' && !item.id) {
        logger.debug('ApifyRedditSource: Item ignored (not a post or missing id)', { item_id: item.id, type: item.dataType });
        ignoredCount++;
        continue;
      }

      if (!item.id || !item.postUrl) {
        logger.debug('ApifyRedditSource: Item ignored (missing id or postUrl)', { item_id: item.id });
        ignoredCount++;
        continue;
      }

      const mediaUrl = this._extractMediaUrl(item);

      // Construct standard raw candidate format for candidateNormalizer.js
      const rawCandidate = {
        platform: 'reddit',
        platform_content_id: item.id, // already has t3_ prefix
        media_url: mediaUrl,
        creator: item.authorName,
        source_url: item.postUrl,
        title: item.title,
        published_at: item.createdAt, // e.g. "2024-05-18T12:00:00.000Z"
        engagement: {
          likes: item.upVotes !== undefined && item.upVotes !== null ? Number(item.upVotes) : null,
          comments: item.commentsCount !== undefined && item.commentsCount !== null ? Number(item.commentsCount) : null
        },
        metadata: {
          body: item.body || item.selftext || '',
          subreddit: item.communityName ? item.communityName.replace('r/', '') : '',
          raw_apify: item // Keep entire raw object for JSONB persistence
        }
      };

      rawCandidates.push(rawCandidate);
    }

    logger.info('ApifyRedditSource: Candidates mapped', {
      discovery_run_id: discoveryRunId,
      apify_run_id: apifyRunId,
      items_retrieved: datasetItems.length,
      candidates_mapped: rawCandidates.length,
      items_ignored: ignoredCount
    });

    // Extract detailed diagnostic age distribution
    const ageBuckets = { 
      '0-3h': 0, '3-6h': 0, '6-9h': 0, '9-12h': 0, 
      '12-15h': 0, '15-18h': 0, '18-21h': 0, '21-24h': 0, 
      '24h+': 0, 'unknown': 0 
    };
    
    let validCount = 0;
    let minAge = Infinity;
    let maxAge = 0;
    let totalAge = 0;
    let inWindow = 0;
    let tooNew = 0;
    let tooOld = 0;
    
    for (const c of rawCandidates) {
      if (!c.published_at) {
        ageBuckets.unknown++;
        continue;
      }
      const pubTime = new Date(c.published_at).getTime();
      if (isNaN(pubTime)) {
        ageBuckets.unknown++;
        continue;
      }
      
      validCount++;
      const ageHours = (Date.now() - pubTime) / 3600000;
      
      minAge = Math.min(minAge, ageHours);
      maxAge = Math.max(maxAge, ageHours);
      totalAge += ageHours;
      
      if (ageHours < 12) tooNew++;
      else if (ageHours <= 24) inWindow++;
      else tooOld++;

      if (ageHours < 3) ageBuckets['0-3h']++;
      else if (ageHours < 6) ageBuckets['3-6h']++;
      else if (ageHours < 9) ageBuckets['6-9h']++;
      else if (ageHours < 12) ageBuckets['9-12h']++;
      else if (ageHours < 15) ageBuckets['12-15h']++;
      else if (ageHours < 18) ageBuckets['15-18h']++;
      else if (ageHours < 21) ageBuckets['18-21h']++;
      else if (ageHours <= 24) ageBuckets['21-24h']++;
      else ageBuckets['24h+']++;
    }

    logger.info('Reddit collection age distribution:', {
      total_retrieved: datasetItems.length,
      valid_published_at: validCount,
      missing_published_at: ageBuckets.unknown,
      min_age: validCount > 0 ? minAge.toFixed(2) : null,
      max_age: validCount > 0 ? maxAge.toFixed(2) : null,
      average_age: validCount > 0 ? (totalAge / validCount).toFixed(2) : null,
      in_12_24h_window: inWindow,
      below_12h: tooNew,
      above_24h: tooOld,
      distribution: ageBuckets
    });

    return { 
      status: finalStatus, 
      receivedCount: rawCandidates.length, 
      candidates: rawCandidates, 
      apifyRunId, 
      datasetId,
      partial: isPartial,
      retryable: !chargeLimitReached,
      accountActionRequired: chargeLimitReached
    };
  }

  _extractMediaUrl(item) {
    if (item.contentUrl) {
      return item.contentUrl;
    }

    if (item.urlOverriddenByDest) {
      return item.urlOverriddenByDest;
    }

    if (item.images && item.images.length > 0) {
      return item.images[0];
    }
    
    // Fallback if the parser didn't catch it but it's an i.redd.it link
    if (item.postUrl && item.postUrl.includes('i.redd.it')) {
      return item.postUrl;
    }

    return null;
  }
}
