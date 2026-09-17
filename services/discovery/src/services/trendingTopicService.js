import { getDatabasePool } from '../database/index.js';
import logger from '../utils/logger.js';
import config from '../config/index.js';

const STOP_WORDS = new Set([
  'the', 'and', 'to', 'of', 'a', 'in', 'is', 'it', 'you', 'that', 'this', 'for', 'on', 'with', 'as', 'are', 'was', 'be', 'at', 'have', 'but', 'not', 'what', 'so', 'can', 'like', 'just', 'my', 'me', 'i', 'im', 'we', 'they', 'them', 'he', 'she', 'his', 'hers', 'their', 'there', 'here', 'when', 'why', 'how', 'do', 'don\'t', 'dont', 'it\'s', 'its', 'from', 'about', 'by', 'if', 'or', 'an', 'your', 'all', 'out', 'up', 'down', 'more', 'less', 'will', 'would', 'should', 'could', 'did', 'done', 'has', 'had', 'been', 'then', 'than', 'now', 'which', 'who', 'whom', 'whose', 'some', 'any', 'no', 'only', 'very', 'too', 'also', 'well', 'much', 'many', 'most', 'other', 'such', 'even', 'over', 'under', 'through', 'into', 'after', 'before', 'between', 'among', 'during', 'without', 'within'
]);

const GENERIC_WORDS = new Set([
  'meme', 'memes', 'funny', 'hilarious', 'lol', 'lmao', 'rofl', 'haha', 'reddit', 'post', 'image', 'picture', 'pic', 'video', 'vid', 'gif', 'today', 'yesterday', 'tomorrow', 'good', 'bad', 'new', 'old', 'best', 'worst', 'top', 'bottom', 'guy', 'guys', 'girl', 'girls', 'man', 'woman', 'people', 'person', 'thing', 'things', 'time', 'day', 'week', 'month', 'year', 'look', 'see', 'watch', 'know', 'think', 'say', 'said', 'make', 'made', 'get', 'got', 'take', 'took', 'go', 'went', 'come', 'came', 'give', 'gave', 'find', 'found', 'use', 'used', 'need', 'needed', 'want', 'wanted', 'feel', 'felt', 'try', 'tried', 'let', 'keep', 'help', 'show', 'part', 'way', 'life', 'world', 'shit', 'fuck', 'damn', 'bitch', 'ass', 'crap', 'hell', 'fucking', 'shitpost', 'r', 'u', 'oc', 'nsfw', 'spoiler'
]);

export async function extractAndScoreTopics() {
  const db = getDatabasePool();
  if (!db) {
    logger.warn('Database disabled, skipping topic extraction');
    return [];
  }

  logger.info('TrendingTopicService: Starting topic extraction');

  try {
    // 1. Fetch recent Reddit candidates (last 48 hours for freq comparison)
    const res = await db.query(`
      SELECT 
        id, 
        platform, 
        metadata_json->>'title' as title, 
        metadata_json->>'body' as body,
        metadata_json->>'subreddit' as subreddit,
        (metadata_json->'engagement'->>'likes')::numeric as likes,
        (metadata_json->'engagement'->>'comments')::numeric as comments,
        created_at
      FROM discovery_candidates
      WHERE platform = 'reddit'
      AND created_at >= NOW() - INTERVAL '48 HOURS'
    `);

    const candidates = res.rows;
    if (candidates.length === 0) {
       logger.info('TrendingTopicService: No recent Reddit candidates found for topic extraction');
       return [];
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const topicStats = new Map();

    // 2. Extract and Aggregate
    for (const c of candidates) {
      const text = `${c.title || ''} ${c.body || ''} ${c.subreddit || ''}`.toLowerCase();
      // Simple word extraction (alphanumeric, length > 2)
      const words = text.match(/[a-z0-9]{3,}/g) || [];
      
      const uniqueWordsInPost = new Set(words);
      
      const isRecent = new Date(c.created_at) >= oneDayAgo;
      const likes = c.likes || 0;
      const comments = c.comments || 0;

      for (const word of uniqueWordsInPost) {
        if (STOP_WORDS.has(word) || GENERIC_WORDS.has(word) || !isNaN(word)) {
          continue; // Skip stopwords, generic words, and pure numbers
        }

        if (!topicStats.has(word)) {
          topicStats.set(word, {
            topic: word,
            current_frequency: 0,
            previous_frequency: 0,
            total_upvotes: 0,
            total_comments: 0,
            communities: new Set(),
            first_seen_at: c.created_at,
            last_seen_at: c.created_at
          });
        }

        const stats = topicStats.get(word);
        
        if (isRecent) {
           stats.current_frequency++;
        } else {
           stats.previous_frequency++;
        }

        stats.total_upvotes += likes;
        stats.total_comments += comments;
        
        if (c.subreddit) {
           stats.communities.add(c.subreddit.toLowerCase());
        }

        if (c.created_at < stats.first_seen_at) stats.first_seen_at = c.created_at;
        if (c.created_at > stats.last_seen_at) stats.last_seen_at = c.created_at;
      }
    }

    // 3. Score and Filter Topics
    const scoredTopics = [];
    
    for (const [topic, stats] of topicStats.entries()) {
      const totalFreq = stats.current_frequency + stats.previous_frequency;
      
      if (totalFreq < config.DISCOVERY_TOPIC_MIN_FREQUENCY) {
        continue;
      }

      const frequency_change = stats.current_frequency - stats.previous_frequency;
      const average_upvotes = totalFreq > 0 ? stats.total_upvotes / totalFreq : 0;
      const average_comments = totalFreq > 0 ? stats.total_comments / totalFreq : 0;
      const communities_seen = Array.from(stats.communities);

      // Scoring Formula
      // Growth (50%): (current_frequency * 0.5) + (frequency_change * 0.5)
      // Engagement (30%): (avg_upvotes * 0.8 + avg_comments * 0.2) / 100  (normalized slightly)
      // Breadth (20%): log(communities + 1) * 10
      
      const growthScore = (stats.current_frequency * 0.5) + (frequency_change * 0.5);
      const engagementScore = ((average_upvotes * 0.8) + (average_comments * 0.2)) / 50; 
      const breadthScore = Math.log(communities_seen.length + 1) * 10;

      const finalScore = (growthScore * 0.5) + (engagementScore * 0.3) + (breadthScore * 0.2);

      scoredTopics.push({
        topic,
        first_seen_at: stats.first_seen_at,
        last_seen_at: stats.last_seen_at,
        observation_count: totalFreq,
        previous_frequency: stats.previous_frequency,
        current_frequency: stats.current_frequency,
        frequency_change,
        average_upvotes,
        average_comments,
        communities_seen,
        score: finalScore
      });
    }

    // Sort by score descending
    scoredTopics.sort((a, b) => b.score - a.score);

    // Limit to top topics
    const topTopics = scoredTopics.slice(0, config.DISCOVERY_MAX_TOPICS);

    // 4. Persist to DB
    for (const t of topTopics) {
       try {
         await db.query(`
           INSERT INTO discovery_topics 
           (topic, first_seen_at, last_seen_at, observation_count, previous_frequency, current_frequency, frequency_change, average_upvotes, average_comments, communities_seen)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (topic) DO UPDATE SET
           last_seen_at = GREATEST(discovery_topics.last_seen_at, EXCLUDED.last_seen_at),
           observation_count = discovery_topics.observation_count + EXCLUDED.current_frequency,
           previous_frequency = EXCLUDED.previous_frequency,
           current_frequency = EXCLUDED.current_frequency,
           frequency_change = EXCLUDED.frequency_change,
           average_upvotes = EXCLUDED.average_upvotes,
           average_comments = EXCLUDED.average_comments,
           communities_seen = (
             SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(discovery_topics.communities_seen || EXCLUDED.communities_seen) t(x)
           )
         `, [
           t.topic,
           t.first_seen_at,
           t.last_seen_at,
           t.observation_count,
           t.previous_frequency,
           t.current_frequency,
           t.frequency_change,
           t.average_upvotes,
           t.average_comments,
           JSON.stringify(t.communities_seen)
         ]);
       } catch (dbErr) {
         logger.warn('Failed to insert/update topic', { topic: t.topic, error: dbErr.message });
       }
    }

    logger.info('TrendingTopicService: Discovered candidate topics', { count: topTopics.length });
    if (topTopics.length > 0) {
       logger.info('TrendingTopicService: Top topic selected', { topic: topTopics[0].topic, score: topTopics[0].score });
    }

    return topTopics;

  } catch (err) {
    logger.error('TrendingTopicService: Topic extraction failed', { error: err.message });
    return []; // Return empty array on failure, do not crash
  }
}
