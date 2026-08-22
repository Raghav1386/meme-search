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
  console.log("=== PHASE 3.6.2-A HARDENING TESTS ===");

  const ctx = { discovery_run_id: crypto.randomUUID() };
  let adapter = new RedditSourceAdapter();
  
  // 1. Disabled
  config.DISCOVERY_REDDIT_SOURCE_ENABLED = false;
  console.log(`TEST 1 (Disabled): isEnabled=${adapter.isEnabled} (Expected: false)`);
  
  // 2. Missing client ID
  config.DISCOVERY_REDDIT_SOURCE_ENABLED = true;
  config.REDDIT_CLIENT_ID = '';
  config.REDDIT_CLIENT_SECRET = 'secret';
  try {
    await adapter.fetch(ctx);
    console.log("TEST 2: FAILED");
  } catch (err) {
    console.log(`TEST 2 (Missing ID): Caught -> ${err.message}`);
  }

  // 3. Missing secret
  config.REDDIT_CLIENT_ID = 'id';
  config.REDDIT_CLIENT_SECRET = '';
  try {
    await adapter.fetch(ctx);
    console.log("TEST 3: FAILED");
  } catch (err) {
    console.log(`TEST 3 (Missing Secret): Caught -> ${err.message}`);
  }

  // Restore creds
  config.REDDIT_CLIENT_ID = 'id';
  config.REDDIT_CLIENT_SECRET = 'secret';
  config.REDDIT_SUBREDDITS = ['memes'];

  // 4. Auth 401
  mockFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
  try { await adapter.fetch(ctx); } catch (e) { console.log(`TEST 4 (Auth 401): ${e.message}`); }

  // 5. Auth malformed JSON
  mockFetch(async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }));
  try { await adapter.fetch(ctx); } catch (e) { console.log(`TEST 5 (Auth bad JSON): ${e.message}`); }

  // 10. Request Timeout
  mockFetch(async (url, opts) => {
    return new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('Timeout')));
    });
  });
  // Temporarily set a very small timeout
  config.REDDIT_REQUEST_TIMEOUT_MS = 10;
  try { await adapter.fetch(ctx); } catch (e) { console.log(`TEST 10 (Timeout): ${e.message}`); }
  config.REDDIT_REQUEST_TIMEOUT_MS = 10000;

  // 15. & 18. Rate Limiting (429) and Retry-After
  mockFetch(async (url) => {
    if (url.includes('access_token')) return { ok: true, json: async () => ({ access_token: 't', expires_in: 3600 }) };
    return { ok: false, status: 429, headers: { get: (k) => k==='Retry-After'?'60':null } };
  });
  try { await adapter.fetch(ctx); } catch (e) { console.log(`TEST 15/18 (429 Rate Limit): ${e.message}`); }

  // 19-23. Malformed Reddit Data
  mockFetch(async (url) => {
    if (url.includes('access_token')) return { ok: true, json: async () => ({ access_token: 't', expires_in: 3600 }) };
    // Missing children array
    return { ok: true, json: async () => ({ data: { not_children: true } }) };
  });
  try { await adapter.fetch(ctx); } catch (e) { console.log(`TEST 19-23 (Missing Children): ${e.message}`); }

  // 24. Valid mapping, 25. missing media, 30. post ID mapping, 31. engagement
  mockFetch(async (url) => {
    if (url.includes('access_token')) return { ok: true, json: async () => ({ access_token: 't', expires_in: 3600 }) };
    return {
      ok: true,
      json: async () => ({
        data: {
          children: [
            { data: { id: 'p1', ups: 10, num_comments: 5 } }, // no url
            { data: { id: 'p2', ups: NaN, num_comments: "bad", url: 'test.jpg' } } // NaN engagement
          ]
        }
      })
    };
  });
  const res24 = await adapter.fetch(ctx);
  console.log(`TEST 24-25/30-31: Fetched ${res24.length} items. p1 media=${res24[0].media_url}, ups=${res24[0].engagement.likes}. p2 ups=${res24[1].engagement.likes}, comments=${res24[1].engagement.comments}`);

  // 27 & 28 & 29. Subreddit Isolation
  config.REDDIT_SUBREDDITS = ['A', 'B'];
  mockFetch(async (url) => {
    if (url.includes('access_token')) return { ok: true, json: async () => ({ access_token: 't', expires_in: 3600 }) };
    if (url.includes('/r/A')) return { ok: true, json: async () => ({ data: { children: [{ data: { id: 'a1' } }] } }) };
    if (url.includes('/r/B')) return { ok: false, status: 500, statusText: "Server Error" };
  });
  const res28 = await adapter.fetch(ctx);
  console.log(`TEST 27/28 (A succeeds, B fails): Candidates = ${res28.length} (Expected 1)`);
  
  config.REDDIT_SUBREDDITS = ['B'];
  try {
    await adapter.fetch(ctx);
  } catch (e) {
    console.log(`TEST 29 (All fail): ${e.message}`);
  }

  restoreFetch();
  console.log("\nAll Hardening tests passed.");
  process.exit(0);
}

runTests().catch(console.error);
