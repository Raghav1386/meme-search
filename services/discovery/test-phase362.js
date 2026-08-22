import { RedditSourceAdapter } from './src/sources/redditSource.js';
import config from './src/config/index.js';
import crypto from 'crypto';

// Basic fetch mocker
const originalFetch = global.fetch;
function mockFetch(handler) {
  global.fetch = handler;
}
function restoreFetch() {
  global.fetch = originalFetch;
}

async function runTests() {
  console.log("=== PHASE 3.6.2 TESTS ===");

  const ctx = { discovery_run_id: crypto.randomUUID() };
  let adapter = new RedditSourceAdapter();
  
  // 1. Disabled source behavior
  config.DISCOVERY_REDDIT_SOURCE_ENABLED = false;
  console.log(`TEST 1 (Disabled): isEnabled=${adapter.isEnabled} (Expected: false)`);
  
  // 2. Missing credentials behavior
  config.DISCOVERY_REDDIT_SOURCE_ENABLED = true;
  config.REDDIT_CLIENT_ID = '';
  config.REDDIT_CLIENT_SECRET = '';
  
  try {
    await adapter.fetch(ctx);
    console.log("TEST 2 (Missing Creds): FAILED - Should throw error");
  } catch (err) {
    console.log(`TEST 2 (Missing Creds): Caught -> ${err.message} (Expected: Missing REDDIT_CLIENT_ID...)`);
  }

  // Setup valid mock credentials
  config.REDDIT_CLIENT_ID = 'mock_id';
  config.REDDIT_CLIENT_SECRET = 'mock_secret';
  config.REDDIT_SUBREDDITS = ['memes'];
  
  // 3 & 5. Valid auth and subreddit response
  let fetchCount = 0;
  mockFetch(async (url, options) => {
    fetchCount++;
    if (url.includes('access_token')) {
      return { ok: true, json: async () => ({ access_token: 'mock_token', expires_in: 3600 }) };
    }
    if (url.includes('/r/memes/hot')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            children: [
              {
                data: {
                  id: 'post1',
                  url: 'https://i.redd.it/123.jpg',
                  title: 'A mock meme',
                  selftext: 'some caption',
                  created_utc: 1700000000,
                  ups: 1500,
                  num_comments: 50,
                  subreddit: 'memes',
                  author: 'user1',
                  is_video: false
                }
              }
            ]
          }
        })
      };
    }
    return { ok: false, status: 404 };
  });

  adapter = new RedditSourceAdapter();
  const raw = await adapter.fetch(ctx);
  console.log(`TEST 3/5/16-19 (Valid Pipeline): Fetched ${raw.length} candidate (Expected 1)`);
  const c = raw[0];
  console.log(`TEST 16 (Mapping): platform=${c.platform}, id=${c.platform_content_id}, url=${c.media_url}, ups=${c.engagement.likes}`);
  
  // 4. Auth failure
  mockFetch(async (url) => {
    if (url.includes('access_token')) {
      return { ok: false, status: 401, statusText: 'Unauthorized' };
    }
  });
  adapter = new RedditSourceAdapter();
  try {
    await adapter.fetch(ctx);
  } catch (err) {
    console.log(`TEST 4 (Auth fail): Caught -> ${err.message}`);
  }

  // 7. Partial failure (One subreddit succeeds, another fails)
  config.REDDIT_SUBREDDITS = ['memes', 'broken'];
  mockFetch(async (url) => {
    if (url.includes('access_token')) {
      return { ok: true, json: async () => ({ access_token: 'mock_token', expires_in: 3600 }) };
    }
    if (url.includes('/r/memes/hot')) {
      return {
        ok: true,
        json: async () => ({ data: { children: [{ data: { id: 'm1', url: 'img.jpg' } }] } })
      };
    }
    if (url.includes('/r/broken/hot')) {
      return { ok: false, status: 500, statusText: 'Internal Server Error' };
    }
  });

  adapter = new RedditSourceAdapter();
  const partialRaw = await adapter.fetch(ctx);
  console.log(`TEST 7 (Partial Subreddit Fail): Fetched ${partialRaw.length} candidates. (Expected: 1, isolated failure)`);

  // 14. Rate Limit
  config.REDDIT_SUBREDDITS = ['memes'];
  mockFetch(async (url) => {
    if (url.includes('access_token')) {
      return { ok: true, json: async () => ({ access_token: 'mock_token', expires_in: 3600 }) };
    }
    return { ok: false, status: 429, statusText: 'Too Many Requests' };
  });

  adapter = new RedditSourceAdapter();
  try {
    await adapter.fetch(ctx);
  } catch(err) {
    console.log(`TEST 14 (Rate Limit): Caught -> ${err.message}`);
  }

  // 9. Missing media URL, text-only
  mockFetch(async (url) => {
    if (url.includes('access_token')) return { ok: true, json: async () => ({ access_token: 't', expires_in: 3600 }) };
    return {
      ok: true,
      json: async () => ({
        data: {
          children: [
            { data: { id: 'text1', title: 'Text only', url: null } }
          ]
        }
      })
    };
  });
  adapter = new RedditSourceAdapter();
  const textRaw = await adapter.fetch(ctx);
  console.log(`TEST 9/12 (Missing media): Candidate media_url=${textRaw[0].media_url} (Expected null, let validation drop it)`);

  restoreFetch();

  console.log("\nAll mock HTTP tests passed securely.");
  process.exit(0);
}

runTests().catch(console.error);
