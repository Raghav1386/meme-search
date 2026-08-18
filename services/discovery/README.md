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

## 7. Health Check
```bash
curl http://localhost:4000/health
```

## 8. Current Architecture
A lightweight Node.js/Express service acting as the foundation for future discovery jobs.

## 9. Future Responsibilities
- Periodic and daily candidate discovery via `node-cron`.
- Normalizing candidates from multiple platform adapters.
- Trend scoring based on velocity and freshness.
- Queuing high-value candidates into BullMQ.
