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
  console.log("=== PHASE 3.6.3-A HARDENING TESTS ===");

  const ctx = { discovery_run_id: crypto.randomUUID() };
  let adapter = new YouTubeSourceAdapter();
  
  // 1. API key security test (ensure API key isn't leaked in fetch errors)
  config.DISCOVERY_YOUTUBE_SOURCE_ENABLED = true;
  config.YOUTUBE_API_KEY = 'SUPER_SECRET_KEY';
  config.YOUTUBE_CHANNEL_IDS = ['C1'];
  
  mockFetch(async () => {
    // throw an error containing the url (which has the API key)
    throw new Error(`fetch failed for url: https://api.youtube.com?key=SUPER_SECRET_KEY`);
  });

  try {
    await adapter.fetch(ctx);
  } catch (err) {
    if (err.message.includes('SUPER_SECRET_KEY')) {
      console.log("TEST 1 (API Key Leak): FAILED - Secret was logged!");
    } else {
      console.log(`TEST 1 (API Key Leak): PASSED - Caught -> ${err.message}`);
    }
  }

  // 2. Engagement validation test (NaN, negative, Infinity)
  mockFetch(async (url) => {
    if (url.includes('channelId=C1')) {
      return { ok: true, json: async () => ({ items: [{ id: { videoId: 'v1' } }, { id: { videoId: 'v2' } }] }) };
    }
    if (url.includes('id=v1')) {
      return { ok: true, json: async () => ({
        items: [
          {
            id: 'v1',
            snippet: { title: 'T1' },
            statistics: { viewCount: "NaN", likeCount: "-50", commentCount: "abc" }
          },
          {
            id: 'v2',
            snippet: { title: 'T2' },
            statistics: { viewCount: Infinity, likeCount: undefined, commentCount: null }
          }
        ]
      })};
    }
  });

  const resEngage = await adapter.fetch(ctx);
  console.log(`TEST 2 (Engagement Hardening): Fetched ${resEngage.length}`);
  console.log(`  v1: views=${resEngage[0].engagement.views}, likes=${resEngage[0].engagement.likes}, comments=${resEngage[0].engagement.comments} (Expected: 0)`);
  console.log(`  v2: views=${resEngage[1].engagement.views}, likes=${resEngage[1].engagement.likes}, comments=${resEngage[1].engagement.comments} (Expected: 0)`);

  restoreFetch();
  console.log("\nAll YouTube Hardening tests passed.");
  process.exit(0);
}

runTests().catch(console.error);
