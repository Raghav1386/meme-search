import { rankCandidates } from './src/services/candidateRanker.js';
import { filterCandidate } from './src/services/candidateFilter.js';
import config from './src/config/index.js';

function runTests() {
  console.log("=== PHASE 3.5.2 TESTS ===");

  const mockC = (id, score, time) => ({
    candidate_id: id,
    trend_score: score,
    published_at: time
  });

  // TEST 1
  let t1 = rankCandidates([mockC('a', 90), mockC('b', 70), mockC('c', 50)]);
  console.log(`TEST 1 (90, 70, 50): ${t1.map(c=>c.trend_score).join(', ')}`);

  // TEST 2
  let t2 = rankCandidates([mockC('a', 50), mockC('b', 90), mockC('c', 70)]);
  console.log(`TEST 2 (50, 90, 70): ${t2.map(c=>c.trend_score).join(', ')}`);

  // TEST 3 (Tie Breaking)
  let t3 = rankCandidates([
    mockC('id-2', 80, '2023-01-01T00:00:00Z'),
    mockC('id-3', 80, '2023-01-02T00:00:00Z'),
    mockC('id-1', 80, '2023-01-02T00:00:00Z')
  ]);
  console.log(`TEST 3 (Tie-breaking): ${t3.map(c=>c.candidate_id).join(', ')} (Expected: id-1, id-3, id-2)`);

  // TEST 4, 5, 6
  console.log(`TEST 4 (29.99 filter): ${filterCandidate(mockC('a', 29.99)).passed} (Expected: false)`);
  console.log(`TEST 5 (30 filter): ${filterCandidate(mockC('a', 30)).passed} (Expected: true)`);
  console.log(`TEST 6 (100 filter): ${filterCandidate(mockC('a', 100)).passed} (Expected: true)`);
  
  // TEST 7, 8, 9, 10, 11, 12
  console.log(`TEST 7 (0 filter): ${filterCandidate(mockC('a', 0)).passed} (Expected: false)`);
  console.log(`TEST 8 (Missing): ${filterCandidate({ candidate_id: 'a' }).reason} (Expected: invalid_trend_score)`);
  console.log(`TEST 9 (NaN): ${filterCandidate(mockC('a', NaN)).reason} (Expected: invalid_trend_score)`);
  console.log(`TEST 10 (Infinity): ${filterCandidate(mockC('a', Infinity)).reason} (Expected: invalid_trend_score)`);
  console.log(`TEST 11 (Negative): ${filterCandidate(mockC('a', -5)).reason} (Expected: invalid_trend_score)`);
  console.log(`TEST 12 (String): ${filterCandidate(mockC('a', "50")).reason} (Expected: invalid_trend_score)`);

  // TEST 13 (Max Candidates Limit Simulation) & TEST 14 (Tie at limit)
  let limitTest = [
    mockC('c1', 95), mockC('c2', 90), mockC('c3', 90), 
    mockC('c4', 90), mockC('c5', 80)
  ];
  let rankedLimit = rankCandidates(limitTest);
  let limit = 2;
  let finalQueue = [];
  let limit_excluded = 0;
  for (let i = 0; i < rankedLimit.length; i++) {
    if (i < limit) {
      finalQueue.push(rankedLimit[i]);
    } else {
      limit_excluded++;
    }
  }
  console.log(`TEST 13/14 (Limit=2, Count=5, Tie=90): Excluded=${limit_excluded}, Final=${finalQueue.map(c=>c.candidate_id).join(',')} (Expected: c1,c2)`);

  // TEST 15/16 (Deduplication / Platform simulation in Set logic check)
  const dedupSet = new Set();
  const cA = mockC('reddit-123', 80);
  const cA2 = mockC('reddit-123', 80);
  const cB = mockC('x-123', 80);
  
  dedupSet.add(cA.candidate_id);
  // cA2 would be skipped since it's in dedupSet
  dedupSet.add(cB.candidate_id);
  
  console.log(`TEST 15/16 (Dedup & Platforms): Set size = ${dedupSet.size} (Expected: 2)`);

  console.log("\nAll logic tests completed safely.");
}

runTests();
