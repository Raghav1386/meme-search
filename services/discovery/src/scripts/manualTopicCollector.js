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

const GLOBAL_LIMIT = 50;
const OUTPUT_DIR = path.resolve(process.cwd(), '../../../manual-reddit-collection/output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'memes-50-salman-khan.json');

const TOPICS = [
  {
    id: 'salman-khan',
    name: 'Salman Khan',
    target: 50,
    queries: [
      "Salman Khan dadajaan memes",
      "Salman Khan Bigg Boss memes",
      "Salman Khan Bigg Boss trolling",
      "Salman Khan six pack memes",
      "Salman Khan body trolling",
      "Salman Khan fat memes",
      "Salman Khan trolls",
      "Salman Khan troll me now",
      "Salman Khan haters memes",
      "salman khan aajau me aapni pe"
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
  // Filter out pure videos. Allow images and gifs.
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
  const collectedCandidates = [];
  const stats = {
    duplicatesRejected: 0,
    invalidMediaRejected: 0,
    topics: { 'salman-khan': 0 },
    topicDuplicates: { 'salman-khan': 0 },
    mediaTypes: { images: 0, gifs: 0, galleries: 0 }
  };

  // Ensure output dir exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Iterate over topics
  for (const topic of TOPICS) {
    if (collectedCandidates.length >= GLOBAL_LIMIT) break;

    console.log(`\nFetching candidates for topic: ${topic.name}...`);
    
    // Calculate dynamic target allowing fallback filling
    let shortfall = 0;
    for (const prev of TOPICS.slice(0, TOPICS.indexOf(topic))) {
      shortfall += (prev.target - stats.topics[prev.id]);
    }
    const targetForThisTopic = Math.min(topic.target + shortfall, GLOBAL_LIMIT - collectedCandidates.length);

    console.log(`Target for ${topic.name}: ${targetForThisTopic} memes`);

    // Fetch up to 200 items per topic to guarantee we have enough after deduplication
    const input = {
      searchTerms: topic.queries,
      type: "post",
      sort: "top",
      time: "all",
      maxPostsCount: Math.ceil(200 / topic.queries.length), // Approx 20 per query = 200 total on Apify cloud
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
        // Stop if we hit the dynamic topic target OR the global limit
        if (stats.topics[topic.id] >= targetForThisTopic) break;
        if (collectedCandidates.length >= GLOBAL_LIMIT) break;

        if (item.dataType !== 'post' && !item.id) continue;
        
        const mediaUrl = extractMediaUrl(item);
        if (!mediaUrl || !isImageOrGif(mediaUrl)) {
          stats.invalidMediaRejected++;
          continue;
        }

        // Formulate output JSON structure combining existing Candidate data + custom fields
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
          // Custom additions to output format specifically requested
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
        
        // Merge in the custom fields so they appear when serialized
        Object.assign(candidate, rawCandidate);

        // Deduplication Step
        try {
          const buffer = await fetchMediaBytes(candidate.media_url);
          
          // SHA256 Check
          const hashResult = calculateHash(buffer);
          const dupResult = await checkDuplicate(hashResult.hash);
          if (dupResult.duplicate) {
            stats.duplicatesRejected++;
            stats.topicDuplicates[topic.id]++;
            console.log(`  [Rejected] SHA256 Duplicate: ${candidate.candidate_id}`);
            continue;
          }
          candidate.sha256_hash = hashResult.hash;

          // pHash Check
          const phashResult = await calculatePhash(buffer);
          const pDupResult = await checkPhashDuplicate(phashResult.hash);
          if (pDupResult.duplicate) {
            stats.duplicatesRejected++;
            stats.topicDuplicates[topic.id]++;
            console.log(`  [Rejected] pHash Duplicate: ${candidate.candidate_id}`);
            continue;
          }
          candidate.phash = phashResult.hash;

          // Passed!
          collectedCandidates.push(candidate);
          stats.topics[topic.id]++;
          
          if (mediaUrl.toLowerCase().endsWith('.gif')) {
            stats.mediaTypes.gifs++;
          } else if (item.images && item.images.length > 1) {
            stats.mediaTypes.galleries++;
          } else {
            stats.mediaTypes.images++;
          }
          
          console.log(`  [Accepted] ${candidate.candidate_id} (${stats.topics[topic.id]}/${targetForThisTopic} for ${topic.name}) - Total: ${collectedCandidates.length}/${GLOBAL_LIMIT}`);

        } catch (err) {
          console.log(`  [Error] Skipping ${candidate.candidate_id}: ${err.message}`);
          stats.invalidMediaRejected++;
          continue;
        }
      }
    } catch (err) {
      console.error(`Error collecting ${topic.name}:`, err.message);
      // We don't crash, we just continue to the next topic
    }
  }

  // Defensive validation as requested
  if (collectedCandidates.length > 50) {
    throw new Error("Manual collection exceeded maximum of 50 memes");
  }

  // Save to JSON
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collectedCandidates, null, 2));
  
  // Enqueue if requested
  if (enqueueMode && collectedCandidates.length > 0) {
    console.log(`\nEnqueueing ${collectedCandidates.length} candidates to meme-ingestion...`);
    initQueue();
    for (const c of collectedCandidates) {
      await enqueueCandidate(c, 'manual-collection-run');
    }
    await closeQueue();
    console.log(`Finished enqueueing.`);
  }

  console.log(`\n========================================`);
  console.log(`MANUAL REDDIT MEME COLLECTION REPORT`);
  console.log(`========================================`);
  console.log(`Total collected: ${collectedCandidates.length} / ${GLOBAL_LIMIT}\n`);
  
  console.log(`Salman Khan:`);
  console.log(`  Target: 50`);
  console.log(`  Collected: ${stats.topics['salman-khan']}`);
  console.log(`  Duplicates rejected: ${stats.topicDuplicates['salman-khan']}\n`);

  console.log(`Total duplicates rejected: ${stats.duplicatesRejected}`);
  console.log(`Total invalid media rejected: ${stats.invalidMediaRejected}`);
  console.log(`========================================`);
  console.log(`JSON saved to: ${OUTPUT_FILE}`);
  
  if (!enqueueMode) {
    console.log(`\n(Did not enqueue to BullMQ. Run with --enqueue to ingest them)`);
  }
  
  process.exit(0);
}

runCollector();
