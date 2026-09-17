# MemeSearch Discovery Service

## 1. Purpose
The Discovery Service is responsible for autonomously discovering new memes, calculating trend scores, and queuing the best candidates for ingestion. 

**Note: Discovery functionality is intentionally not implemented in Phase 1.**

## 2. Current Responsibilities (Phase 1)
- Structured logging (Winston)
- Configuration validation (Dotenv)
- Application health check (`GET /health`)
- Graceful shutdown handling

## 3. Current Non-Responsibilities
- Does not download memes.
- Does not connect to Reddit or YouTube.
- Does not connect to Redis/BullMQ.
- Does not rank candidates.

## 4. How to Install
```bash
cd services/discovery
npm install
```

## 5. How to Run
```bash
# Copy the env template and modify as needed
cp .env.example .env

# Start the service
npm start
```

## 6. Environment Variables
- `PORT` (default: 4000)
- `LOG_LEVEL` (default: info)
- `REDIS_URL`: Connection string for BullMQ and Upstash
- `TREND_ENGAGEMENT_WEIGHT` (default: 0.6): Weight of engagement in the trend score.
- `TREND_FRESHNESS_WEIGHT` (default: 0.4): Weight of freshness in the trend score.
- `TREND_FRESHNESS_HALFLIFE_HOURS` (default: 48): Exponential decay half-life for published candidates.
- `TREND_MIN_SCORE` (default: 30): Controls minimum quality; candidates below this trend score are filtered out.
- `TREND_MAX_CANDIDATES_PER_RUN` (default: 100): Limits queue pressure by taking only the top N ranked candidates per run.

## 7. Trend Scoring
The trend score is a metadata-based heuristic bounded between `0` and `100`. It is NOT a machine-learning prediction of virality.
- **Engagement Normalization**: Logarithmic normalization bounds metrics (Views, Likes, Comments) against extreme outliers.
- **Freshness**: Uses simple exponential decay. Missing metadata defaults to neutral (50). Future timestamps are securely clamped.
- **Velocity**: Excluded by design as only lifetime engagement snapshots are available to Discovery.
- **Missing Metadata**: Cleanly distributed or neutralized; missing metrics do not crash candidate processing.
- **Score Breakdown**: Yields an explainable `components` object mapping engagement and freshness subsets.

## 7. Health Check
```bash
curl http://localhost:4000/health
```

## 8. Source Adapter Architecture
The discovery core is completely platform-agnostic and relies on a rigid **Source Adapter Contract** to communicate with external platforms.

- **Source Adapter Contract**: Every platform must implement the abstract `SourceAdapter` class (`src/sources/sourceAdapter.js`). Adapters must provide a unique `name`, an `isEnabled` boolean, and a `fetch(context)` method that returns raw candidate objects.
- **Raw Candidate Responsibility**: Source adapters only fetch and emit raw data. They do NOT normalize, validate, score, or queue candidates.
- **Source Registration**: Sources are registered statically in the array at `src/sources/index.js`.
- **Enable/Disable Behavior**: Adapters determine their active state via configuration (e.g., `DISCOVERY_MOCK_SOURCE_ENABLED=true`). Disabled sources are safely skipped.
- **Source Failure Isolation**: If a source adapter crashes or throws an exception (e.g. rate limit, network timeout), the Source Manager isolates the failure, logs the error, and continues executing all other registered sources natively. It will aggregate valid candidates from surviving sources without crashing the Discovery Run.

### Available Sources
- `reddit`: A production source fetching hot posts from configured subreddits via Application-Only OAuth.
- `mock`: Emits a predefined payload of raw candidates for regression testing.
- `mock-fail`: Emits a fatal exception to verify source boundary isolation.

### Apify Reddit Source Configuration (Phase 1)
The Reddit source relies on the official Apify Client to execute the `harshmaur~reddit-scraper` Actor. It dynamically accepts a search query.
To enable it, provide the following environment variables:
```env
DISCOVERY_APIFY_REDDIT_ENABLED=true
APIFY_API_TOKEN=your_apify_token_here
APIFY_REDDIT_ACTOR=harshmaur~reddit-scraper
```
- **Authentication**: Requires a valid Apify API Token. Tokens are kept in memory and never logged, returned, or exposed.
- **Actor Behavior**: It executes a global search (no fixed subreddits) returning only Post records.
- **Triggering**: You can dynamically pass a search query to the Apify Actor using the `/api/discovery/collect` endpoint.
- **Failure Isolation**: Network failures, Apify authentication failures, and Actor timeouts are safely caught and isolated.

#### How to start a Reddit collection
```bash
curl -X POST http://localhost:4000/api/discovery/collect \
  -H "Content-Type: application/json" \
  -d '{"query": "meme"}'
```
This triggers the Apify Actor with the provided query, fetches the results, and feeds them into the existing Discovery pipeline. The MemeSearch application is completely untouched and isolated from this process.

### YouTube Source Configuration
The YouTube source fetches videos using the official YouTube Data API v3. 
To enable it, provide the following environment variables:
```env
DISCOVERY_YOUTUBE_SOURCE_ENABLED=true
YOUTUBE_API_KEY=your_api_key_here
YOUTUBE_CHANNEL_IDS=UCxyz123,UCabc456
YOUTUBE_SEARCH_QUERY=memes
YOUTUBE_LIMIT=25
YOUTUBE_REQUEST_TIMEOUT_MS=10000
```
- **Authentication**: Requires a valid API Key. The key is never logged.
- **Discovery Modes**:
  - **Channel-based mode**: If `YOUTUBE_CHANNEL_IDS` is provided, it independently fetches recent videos for each configured channel.
  - **Search-based mode**: If channel IDs are empty and `YOUTUBE_SEARCH_QUERY` is provided, it performs a keyword-based search for recent videos.
- **Failure Isolation**: Each channel is fetched independently. If one channel hits a quota limit (403) or times out, candidates from other channels are preserved.
- **Media Download**: Note that the Discovery phase **does NOT download videos**. It simply extracts the canonical `watch?v=` URL for the Ingestion worker to handle later.

## 9. Current Architecture
A Node.js/Express service acting as the foundation for the discovery jobs.

## 10. Future Responsibilities
- Periodic and daily candidate discovery via `node-cron`.
- Normalizing candidates from multiple platform adapters.
- Trend scoring based on velocity and freshness.
- Queuing high-value candidates into BullMQ.
