import { scoreCandidate } from './src/services/trendScorer.js';
import { Candidate } from '../shared/models/Candidate.js';

function runTests() {
  console.log("=== PHASE 3.5.1 SCORING TESTS ===");
  const now = Date.now();

  const mockCandidate = (engagement, published_at) => new Candidate({
    candidate_id: 'test-001',
    platform: 'mock',
    media_url: 'http://a',
    engagement,
    published_at
  });

  // TEST 1: Very recent candidate with strong engagement.
  const t1 = scoreCandidate(mockCandidate({ views: 100000000, likes: 10000000, comments: 1000000 }, new Date(now - 1000 * 60 * 60).toISOString()), now);
  console.log(`Test 1 (Recent/Strong): Score=${t1.trend_score} (Eng=${t1.components.engagement.toFixed(1)}, Fresh=${t1.components.freshness.toFixed(1)})`);

  // TEST 2: Very old candidate with weak engagement.
  const t2 = scoreCandidate(mockCandidate({ views: 10, likes: 1, comments: 0 }, new Date(now - 1000 * 60 * 60 * 24 * 365).toISOString()), now);
  console.log(`Test 2 (Old/Weak): Score=${t2.trend_score} (Eng=${t2.components.engagement.toFixed(1)}, Fresh=${t2.components.freshness.toFixed(1)})`);

  // TEST 3: Recent candidate with low engagement.
  const t3 = scoreCandidate(mockCandidate({ views: 0, likes: 0, comments: 0 }, new Date(now).toISOString()), now);
  console.log(`Test 3 (Recent/Low Eng): Score=${t3.trend_score} (Eng=${t3.components.engagement.toFixed(1)}, Fresh=${t3.components.freshness.toFixed(1)})`);

  // TEST 4: Old candidate with huge engagement.
  const t4 = scoreCandidate(mockCandidate({ views: 1000000000, likes: 100000000, comments: 10000000 }, new Date(now - 1000 * 60 * 60 * 24 * 365).toISOString()), now);
  console.log(`Test 4 (Old/Huge Eng): Score=${t4.trend_score} (Eng=${t4.components.engagement.toFixed(1)}, Fresh=${t4.components.freshness.toFixed(1)})`);

  // TEST 5, 6, 7, 8: Missing engagements
  const t5 = scoreCandidate(mockCandidate({ likes: 100, comments: 10 }, new Date(now).toISOString()), now);
  const t8 = scoreCandidate(mockCandidate({}, new Date(now).toISOString()), now);
  console.log(`Test 5 (Missing views): Score=${t5.trend_score}`);
  console.log(`Test 8 (Missing all eng): Score=${t8.trend_score}`);

  // TEST 9, 10, 11: Timestamps
  const t9 = scoreCandidate(mockCandidate({ views: 1000 }, null), now);
  const t10 = scoreCandidate(mockCandidate({ views: 1000 }, 'invalid-date'), now);
  const t11 = scoreCandidate(mockCandidate({ views: 1000 }, new Date(now + 1000 * 60 * 60 * 24).toISOString()), now);
  console.log(`Test 9 (Missing time): Score=${t9.trend_score} (Freshness=${t9.components.freshness.toFixed(1)})`);
  console.log(`Test 10 (Invalid time): Score=${t10.trend_score} (Freshness=${t10.components.freshness.toFixed(1)})`);
  console.log(`Test 11 (Future time): Score=${t11.trend_score} (Freshness=${t11.components.freshness.toFixed(1)})`);

  // TEST 12, 13, 14: Negative/NaN/Extreme
  const t12 = scoreCandidate(mockCandidate({ views: -500 }, new Date(now).toISOString()), now);
  const t13 = scoreCandidate(mockCandidate({ views: NaN }, new Date(now).toISOString()), now);
  const t14 = scoreCandidate(mockCandidate({ views: 1e12 }, new Date(now).toISOString()), now); // Should bound log
  console.log(`Test 12 (Negative eng): Score=${t12.trend_score}`);
  console.log(`Test 13 (NaN eng): Score=${t13.trend_score}`);
  console.log(`Test 14 (1 Trillion Views): Score=${t14.trend_score} (Eng=${t14.components.engagement.toFixed(1)})`);

  // TEST 15, 16: Determinism
  const c16a = mockCandidate({ views: 100 }, new Date(now - 1000 * 60 * 60).toISOString());
  const c16b = mockCandidate({ views: 100 }, new Date(now - 1000 * 60 * 60).toISOString());
  const t16a = scoreCandidate(c16a, now);
  const t16b = scoreCandidate(c16b, now);
  console.log(`Test 15/16 (Determinism): Identical? ${t16a.trend_score === t16b.trend_score}`);
}

runTests();
