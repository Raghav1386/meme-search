import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment early from the discovery service root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Imports from existing discovery architecture
import config from '../config/index.js';
import { fetchMediaBytes } from '../services/mediaAcquisition.js';
import { calculateHash } from '../services/sha256Service.js';
import { checkDuplicate } from '../services/duplicateDetector.js';
import { calculatePhash } from '../services/phashService.js';
import { checkPhashDuplicate } from '../services/phashDuplicateDetector.js';
import { initQueue, enqueueCandidate, closeQueue } from '../queue/producer.js';
import { Candidate } from '../../../shared/models/Candidate.js';

const OUTPUT_DIR = path.resolve(process.cwd(), '../../../manual-reddit-collection/output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'memes-80-ghee-khatam-sohel-khan.json');

const TOPICS = [
  {
    id: 'ghee_khatam',
    name: 'Ghee Khatam',
    target: 40,
    queries: [
      "Ghee Khatam memes", "ghee khatam", "ghee khatam meme", "ghee khatam memes reddit",
      "ghee khatam template", "ghee khatam reaction", "ghee khatam gif", "ghee khatam funny",
      "ghee khatam trolling", "ghee khatam trend"
    ]
  },
  {
    id: 'sohel_khan',
    name: 'Sohel Khan',
    target: 40,
    queries: [
      "Sohel Khan memes", "Sohel Khan meme", "Sohel Khan memes reddit", "Sohel Khan funny",
      "Sohel Khan trolling", "Sohel Khan reaction", "Sohel Khan reaction meme", "Sohel Khan template",
      "Sohel Khan GIF", "Sohail Khan memes"
    ]
  }
];

function extractMediaUrl(item) {
  if (item.contentUrl) return item.contentUrl;
  if (item.urlOverriddenByDest) return item.urlOverriddenByDest;
  if (item.images && item.images.length > 0) return item.images[0];
  if (item.postUrl && item.postUrl.includes('i.redd.it')) return item.postUrl;
  return null;
}

function isImageOrGif(url) {
  if (!url) return false;
  const lurl = url.toLowerCase();
  if (lurl.endsWith('.mp4') || lurl.endsWith('.mov') || lurl.includes('v.redd.it')) return false;
  return true;
}

async function runCollector() {
  const args = process.argv.slice(2);
  const enqueueMode = args.includes('--enqueue');
  
  console.log(`\n========================================`);
  console.log(`MANUAL REDDIT MEME COLLECTION STARTED`);
  console.log(`========================================\n`);

  if (!config.APIFY_API_TOKEN || config.APIFY_API_TOKEN === 'your_apify_token_here') {
    console.error("ERROR: APIFY_API_TOKEN is missing. Cannot run collection.");
    process.exit(1);
  }

  const client = new ApifyClient({ token: config.APIFY_API_TOKEN });
  
  const stats = {
    ghee_khatam: { candidates: [], duplicatesRejected: 0, invalidMediaRejected: 0 },
    sohel_khan: { candidates: [], duplicatesRejected: 0, invalidMediaRejected: 0 }
  };

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const topic of TOPICS) {
    console.log(`\nFetching candidates for topic: ${topic.name}...`);
    console.log(`Target for ${topic.name}: ${topic.target} memes limit strictly enforced`);

    // Fetch up to 100 items per topic (10 per query) to save Apify cloud credits
    const input = {
      searchTerms: topic.queries,
      type: "post",
      sort: "top",
      time: "all",
      maxPostsCount: Math.ceil(100 / topic.queries.length), 
      searchPosts: true,
      skipComments: true
    };

    try {
      const runResult = await client.actor(config.APIFY_REDDIT_ACTOR).call(input);
      if (!runResult.defaultDatasetId) {
        console.log(`No dataset returned for ${topic.name}`);
        continue;
      }

      const dataset = await client.dataset(runResult.defaultDatasetId).listItems();
      const items = dataset.items || [];
      console.log(`Found ${items.length} raw Apify items for ${topic.name}`);

      for (const item of items) {
        // STRICT TOPIC LIMIT
        if (stats[topic.id].candidates.length >= topic.target) break;

        if (item.dataType !== 'post' && !item.id) continue;
        
        const mediaUrl = extractMediaUrl(item);
        if (!mediaUrl || !isImageOrGif(mediaUrl)) {
          stats[topic.id].invalidMediaRejected++;
          continue;
        }

        const rawCandidate = {
          candidate_id: `reddit-${item.id}`,
          platform: 'reddit',
          platform_content_id: item.id,
          media_url: mediaUrl,
          creator: item.authorName,
          source_url: item.postUrl,
          title: item.title,
          published_at: item.createdAt,
          engagement: {
            likes: Number(item.upVotes || 0),
            comments: Number(item.commentsCount || 0)
          },
          metadata: {
            subreddit: item.communityName ? item.communityName.replace('r/', '') : '',
            topic: topic.id,
            original_query: topic.queries[0]
          },
          topic: topic.id,
          source: "reddit",
          reddit_id: item.id,
          subreddit: item.communityName ? item.communityName.replace('r/', '') : '',
          author: item.authorName,
          created_at: item.createdAt,
          upvotes: Number(item.upVotes || 0),
          comments: Number(item.commentsCount || 0),
          media_type: mediaUrl.toLowerCase().endsWith('.gif') ? "gif" : "image",
          discovery_query: topic.queries[0]
        };

        const candidate = new Candidate(rawCandidate);
        Object.assign(candidate, rawCandidate);

        // Deduplication Step
        try {
          const buffer = await fetchMediaBytes(candidate.media_url);
          
          const hashResult = calculateHash(buffer);
          const dupResult = await checkDuplicate(hashResult.hash);
          if (dupResult.duplicate) {
            stats[topic.id].duplicatesRejected++;
            console.log(`  [Rejected] SHA256 Duplicate: ${candidate.candidate_id}`);
            continue;
          }
          candidate.sha256_hash = hashResult.hash;

          const phashResult = await calculatePhash(buffer);
          const pDupResult = await checkPhashDuplicate(phashResult.hash);
          if (pDupResult.duplicate) {
            stats[topic.id].duplicatesRejected++;
            console.log(`  [Rejected] pHash Duplicate: ${candidate.candidate_id}`);
            continue;
          }
          candidate.phash = phashResult.hash;

          // Check if candidate already exists in the current session (intra-run duplicate)
          if (stats[topic.id].candidates.some(c => c.candidate_id === candidate.candidate_id || c.sha256_hash === candidate.sha256_hash)) {
            stats[topic.id].duplicatesRejected++;
            console.log(`  [Rejected] Session Duplicate: ${candidate.candidate_id}`);
            continue;
          }

          stats[topic.id].candidates.push(candidate);
          console.log(`  [Accepted] ${candidate.candidate_id} (${stats[topic.id].candidates.length}/${topic.target} for ${topic.name})`);

        } catch (err) {
          console.log(`  [Error] Skipping ${candidate.candidate_id}: ${err.message}`);
          stats[topic.id].invalidMediaRejected++;
          continue;
        }
      }
    } catch (err) {
      console.error(`Error collecting ${topic.name}:`, err.message);
    }
  }

  // Defensive validations
  if (stats.ghee_khatam.candidates.length > 40) {
    throw new Error("Ghee Khatam collection exceeded maximum of 40 memes");
  }
  if (stats.sohel_khan.candidates.length > 40) {
    throw new Error("Sohel Khan collection exceeded maximum of 40 memes");
  }
  const totalCombined = stats.ghee_khatam.candidates.length + stats.sohel_khan.candidates.length;
  if (totalCombined > 80) {
    throw new Error("Combined manual collection exceeded maximum of 80 memes");
  }

  // Build the strictly formatted JSON output
  const finalOutput = {
    topics: {
      ghee_khatam: {
        limit: 40,
        total: stats.ghee_khatam.candidates.length,
        queries: TOPICS[0].queries,
        candidates: stats.ghee_khatam.candidates
      },
      sohel_khan: {
        limit: 40,
        total: stats.sohel_khan.candidates.length,
        queries: TOPICS[1].queries,
        candidates: stats.sohel_khan.candidates
      }
    },
    total: totalCombined
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 2));
  
  if (enqueueMode && totalCombined > 0) {
    console.log(`\nEnqueueing ${totalCombined} candidates to meme-ingestion...`);
    initQueue();
    for (const c of stats.ghee_khatam.candidates) await enqueueCandidate(c, 'manual-collection-run');
    for (const c of stats.sohel_khan.candidates) await enqueueCandidate(c, 'manual-collection-run');
    await closeQueue();
    console.log(`Finished enqueueing.`);
  }

  console.log(`\n========================================`);
  console.log(`MANUAL REDDIT MEME COLLECTION REPORT`);
  console.log(`========================================`);
  console.log(`Ghee Khatam: ${stats.ghee_khatam.candidates.length} / 40 (Duplicates rejected: ${stats.ghee_khatam.duplicatesRejected})`);
  console.log(`Sohel Khan: ${stats.sohel_khan.candidates.length} / 40 (Duplicates rejected: ${stats.sohel_khan.duplicatesRejected})`);
  console.log(`Total collected: ${totalCombined} / 80\n`);
  console.log(`JSON saved to: ${OUTPUT_FILE}`);
  
  if (!enqueueMode) {
    console.log(`\n(Did not enqueue to BullMQ. Run with --enqueue to ingest them)`);
  }
  
  process.exit(0);
}

runCollector();
