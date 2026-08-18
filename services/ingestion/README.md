# MemeSearch Ingestion Service

## 1. Purpose
The Ingestion Service is responsible for consuming queued meme candidates, safely downloading the media, deduplicating via cryptographic (SHA-256) and perceptual (pHash) hashing, uploading to Backblaze B2, and passing the results to the existing ML indexing pipeline.

**Note: Actual ingestion processing begins in a later phase. This is only the architectural skeleton.**

## 2. Current Responsibilities
- Structured logging (Winston)
- Configuration validation (Dotenv)
- Application health check (`GET /health`)
- Graceful shutdown handling

## 3. Future Responsibilities
- Consume from BullMQ (Redis)
- Safely download media via `yt-dlp` or native HTTP
- Validate MIME types and file sizes
- Calculate SHA-256 for exact duplicate prevention
- Calculate pHash for perceptual duplicate prevention
- Upload accepted media to Backblaze B2
- Call existing FastAPI `/index-meme` for ML processing
- Track processing states

## 4. Service Architecture
A lightweight Node.js service that operates entirely asynchronously, pulling work from a queue rather than exposing public REST APIs for ingestion.

## 5. Candidate Contract
Defined in `services/shared/models/Candidate.js`. It contains platform-agnostic metadata such as `candidate_id`, `media_url`, `platform`, and `trend_score`.

## 6. Processing States
Defined in `services/shared/models/Status.js`:
- `DISCOVERED`, `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`

## 7. How to Run
```bash
cd services/ingestion
npm install
cp .env.example .env
npm start
```

## 8. Health Check
```bash
curl http://localhost:4001/health
```

## 9. Environment Variables
- `PORT` (default: 4001)
- `LOG_LEVEL` (default: info)

## 10. Intentionally NOT Implemented
- No Redis/BullMQ connection
- No Backblaze B2 upload logic
- No downloading/scraping
- No hashing logic
- No Postgres/FastAPI calls
