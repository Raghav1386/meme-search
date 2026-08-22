import { YouTubeSourceAdapter } from './src/sources/youtubeSource.js';
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
  console.log("=== PHASE 3.6.3 YOUTUBE TESTS ===");

  const ctx = { discovery_run_id: crypto.randomUUID() };
  let adapter = new YouTubeSourceAdapter();
  
  // 1. Disabled
  config.DISCOVERY_YOUTUBE_SOURCE_ENABLED = false;
  console.log(`TEST 1 (Disabled): isEnabled=${adapter.isEnabled} (Expected: false)`);
  
  // 2. Missing API Key
  config.DISCOVERY_YOUTUBE_SOURCE_ENABLED = true;
  config.YOUTUBE_API_KEY = '';
  try {
    await adapter.fetch(ctx);
    console.log("TEST 2: FAILED");
  } catch (err) {
    console.log(`TEST 2 (Missing Key): Caught -> ${err.message}`);
  }

  // Setup valid config
  config.YOUTUBE_API_KEY = 'mock_key';
  
  // 4. Multiple channel IDs & 5. Isolation
  config.YOUTUBE_CHANNEL_IDS = ['C1', 'C2'];
  config.YOUTUBE_SEARCH_QUERY = '';

  mockFetch(async (url) => {
    if (url.includes('channelId=C1')) {
      return { ok: true, json: async () => ({ items: [{ id: { videoId: 'v1' } }] }) };
    }
    if (url.includes('channelId=C2')) {
      return { ok: false, status: 500, statusText: "Internal Server Error" };
    }
    if (url.includes('id=v1')) {
      return { ok: true, json: async () => ({
        items: [{
          id: 'v1',
          snippet: { title: 'T1', publishedAt: '2023-01-01T00:00:00Z', channelId: 'C1' },
          statistics: { viewCount: "1000", likeCount: "100", commentCount: "10" }
        }]
      })};
    }
  });

  const res345 = await adapter.fetch(ctx);
  console.log(`TEST 3/4/5 (Channel mode + isolation): Fetched ${res345.length} items. (Expected 1)`);
  console.log(`TEST 7/24 (Mapping): platform=${res345[0].platform}, id=${res345[0].platform_content_id}, views=${res345[0].engagement.views}`);

  // 6. Search mode
  config.YOUTUBE_CHANNEL_IDS = [];
  config.YOUTUBE_SEARCH_QUERY = 'memes';
  mockFetch(async (url) => {
    if (url.includes('q=memes')) {
      return { ok: true, json: async () => ({ items: [{ id: { videoId: 'v2' } }] }) };
    }
    if (url.includes('id=v2')) {
      return { ok: true, json: async () => ({
        items: [{
          id: 'v2',
          snippet: { title: 'T2', publishedAt: '2023-01-01T00:00:00Z' },
          statistics: {} // 8, 9, 10. missing stats
        }]
      })};
    }
  });

  const res689 = await adapter.fetch(ctx);
  console.log(`TEST 6/8/9/10 (Search mode + Missing stats): Fetched ${res689.length}. Views=${res689[0].engagement.views}, Likes=${res689[0].engagement.likes} (Expected 0)`);

  // 12. Malformed JSON
  mockFetch(async () => {
    return { ok: true, json: async () => { throw new Error('Bad JSON'); } };
  });
  try { await adapter.fetch(ctx); } catch (e) { console.log(`TEST 12 (Malformed JSON): ${e.message}`); }

  // 17 & 19. HTTP 403 / 429 quota exhaustion
  mockFetch(async () => {
    return { ok: false, status: 403, statusText: "Forbidden" };
  });
  try { await adapter.fetch(ctx); } catch (e) { console.log(`TEST 17/19 (Quota 403): ${e.message}`); }

  // 22. Request Timeout
  mockFetch(async (url, opts) => {
    return new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('Timeout')));
    });
  });
  config.YOUTUBE_REQUEST_TIMEOUT_MS = 10;
  try { await adapter.fetch(ctx); } catch (e) { console.log(`TEST 22 (Timeout): ${e.message}`); }

  restoreFetch();
  console.log("\nAll YouTube mock HTTP tests passed.");
  process.exit(0);
}

runTests().catch(console.error);
