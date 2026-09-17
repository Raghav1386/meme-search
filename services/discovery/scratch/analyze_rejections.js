import { getDatabasePool, initDiscoveryDatabase } from '../src/database/index.js';
import { filterRedditCandidate } from '../src/services/redditQualityFilter.js';

async function analyze() {
  await initDiscoveryDatabase();
  const db = getDatabasePool();
  try {
    const runRes = await db.query("SELECT id FROM discovery_runs ORDER BY started_at DESC LIMIT 1");
    if (runRes.rows.length === 0) return console.log("No runs");
    
    const runId = runRes.rows[0].id;
    console.log(`Analyzing run: ${runId}`);
    
    const candRes = await db.query("SELECT * FROM discovery_candidates WHERE run_id = $1", [runId]);
    console.log(`Found ${candRes.rows.length} candidates in DB for this run.`);
    
    const breakdown = {};
    let freshCount = 0;
    
    for (const row of candRes.rows) {
      // Reconstruct candidate
      const candidate = {
        candidate_id: row.id,
        platform: row.platform,
        platform_content_id: row.platform_content_id,
        metadata: row.metadata_json,
        published_at: row.metadata_json?.raw_apify?.createdAt || row.metadata_json?.createdAt,
        engagement: {
          likes: row.metadata_json?.raw_apify?.upVotes,
          comments: row.metadata_json?.raw_apify?.commentsCount
        },
        media_url: 'dummy'
      };
      
      const result = filterRedditCandidate(candidate);
      if (!result.accepted) {
        breakdown[result.reason] = (breakdown[result.reason] || 0) + 1;
      } else {
        freshCount++;
      }
    }
    
    console.log("Rejection Breakdown:");
    console.log(JSON.stringify(breakdown, null, 2));
    console.log(`Candidates that passed: ${freshCount}`);
    
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

analyze();
