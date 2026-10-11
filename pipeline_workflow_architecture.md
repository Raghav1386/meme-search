# MemeSearch: Discovery to Ingestion Workflow Architecture

This document visualizes the complete end-to-end automation pipeline connecting Reddit Discovery to MemeSearch Ingestion via GitHub Actions, Upstash Redis, Neon PostgreSQL, Backblaze B2, and Hugging Face.

---

## 1. High-Level System Architecture & Interconnection

```mermaid
flowchart TD
    %% Schedules & Triggers
    subgraph Schedulers["Trigger & Schedule Layer"]
        D_TRIG["GitHub Schedule: Discovery<br/><b>30 3,15 * * * UTC</b><br/>(9:00 AM & 9:00 PM IST)"]
        I_TRIG["GitHub Schedule: Ingestion<br/><b>45 2,6,10,14,18,22 * * * UTC</b><br/>(Every 4h offset :15 IST)"]
        MAN_TRIG["Manual Trigger<br/><b>workflow_dispatch</b>"]
    end

    %% GitHub Actions Discovery Runner
    subgraph DiscoveryRunner["GitHub Actions Runner: Discovery Service (Ubuntu)"]
        D_START["node src/run-once.js"]
        APIFY_CALL["1. Call Apify Reddit Scraper<br/>(Subreddits: funnyIndia, DesiMemes, etc.)"]
        D_FILTER["2. Filter & Rank Candidates<br/>(Freshness, Velocity, Engagement >= 0.70)"]
        D_DEDUP["3. Perceptual Deduplication (pHash)"]
        D_SAVE_DB["4. Record Discovery Run in Neon DB"]
        D_ENQUEUE["5. BullMQ Producer: Enqueue Job<br/>(Job ID: candidate_id, 3 retries)"]
        D_EXIT["6. Exit Code 0"]

        D_START --> APIFY_CALL --> D_FILTER --> D_DEDUP --> D_SAVE_DB --> D_ENQUEUE --> D_EXIT
    end

    %% Cloud Buffer / Queue
    subgraph QueueLayer["Cloud Message Broker: Upstash Redis"]
        REDIS_Q[("BullMQ Queue:<br/><b>meme-ingestion</b><br/>(State: waiting, active, delayed)")]
    end

    %% GitHub Actions Ingestion Runner
    subgraph IngestionRunner["GitHub Actions Runner: Ingestion Service (Ubuntu)"]
        I_GUARD{"Pre-Flight Check:<br/>Queue has work?"}
        I_SKIP["Log Empty & Exit 0<br/>(Elapsed: < 2 seconds)"]
        I_MIGRATE["Run DB Migrations<br/>(Ensure pgvector & tables exist)"]
        I_WORKER["Initialize BullMQ Worker<br/>(Concurrency = 2)"]
        
        subgraph Pipeline["Ingestion Processing Pipeline"]
            P_DL["1. Download Media (yt-dlp/fetch)<br/>Timeout: 10s | Max: 10MB"]
            P_VAL["2. Validate Image (Sharp)<br/>Dimensions, MIME type, format"]
            P_HASH["3. Hasher Engine<br/>SHA-256 + pHash"]
            P_DEDUP{"4. Exact/Perceptual<br/>Duplicate?"}
            P_B2["5. Upload Canonical Image to B2<br/>(Bucket: memes1386)"]
            P_ML["6. Call ML Indexer API<br/>(Hugging Face Space)"]
            P_DB["7. Persist Metadata & 512-d Vector"]
        end

        I_DRAIN{"All Jobs Drained?<br/>wait=0 & active=0"}
        I_SETTLE["Wait 5s Idle Settle Window"]
        I_EXIT["Close Connections & Exit Code 0"]

        I_GUARD -- "No (Empty)" --> I_SKIP
        I_GUARD -- "Yes (Work Available)" --> I_MIGRATE --> I_WORKER
        I_WORKER --> P_DL --> P_VAL --> P_HASH --> P_DEDUP
        P_DEDUP -- "New Meme" --> P_B2 --> P_ML --> P_DB
        P_DEDUP -- "Duplicate" --> P_DB
        P_DB --> I_DRAIN
        I_DRAIN -- "More Jobs" --> P_DL
        I_DRAIN -- "Queue Empty" --> I_SETTLE --> I_EXIT
    end

    %% External Cloud Infrastructure
    subgraph CloudInfra["External Cloud Infrastructure"]
        APIFY_EXT["Apify Actor<br/>(harshmaur~reddit-scraper)"]
        REDDIT_EXT["Reddit API / Web"]
        NEON_DB[("Neon Cloud PostgreSQL<br/>- ingestion_candidates<br/>- ingestion_media (pgvector)")]
        B2_STORAGE[("Backblaze B2 Storage<br/>Bucket: memes1386")]
        HF_ML["Hugging Face Inference Space<br/>- EasyOCR (Hindi + English)<br/>- CLIP ViT-B/32 (512-d embeddings)"]
    end

    %% User Facing Application
    subgraph ApplicationLayer["End-User Application Layer"]
        BACKEND["Node.js / Express Backend"]
        FRONTEND["React Web Frontend"]
    end

    %% Connections
    D_TRIG --> D_START
    MAN_TRIG -.-> D_START
    MAN_TRIG -.-> I_GUARD
    I_TRIG --> I_GUARD

    APIFY_CALL <--> APIFY_EXT
    APIFY_EXT <--> REDDIT_EXT
    D_SAVE_DB --> NEON_DB
    D_ENQUEUE --> REDIS_Q

    REDIS_Q <--> I_GUARD
    REDIS_Q <--> I_WORKER
    I_MIGRATE --> NEON_DB
    P_B2 --> B2_STORAGE
    P_ML <--> HF_ML
    P_DB --> NEON_DB

    NEON_DB <--> BACKEND
    B2_STORAGE <--> FRONTEND
    BACKEND <--> FRONTEND
```

---

## 2. Sequence of Execution Over Time

```mermaid
sequenceDiagram
    autonumber
    participant D_Cron as GitHub Actions (Discovery Cron)
    participant D_Runner as Discovery Worker (run-once.js)
    participant Apify as Apify Reddit Actor
    participant Upstash as Upstash Redis (BullMQ)
    participant I_Cron as GitHub Actions (Ingestion Cron)
    participant I_Runner as Ingestion Worker (run-once.js)
    participant B2 as Backblaze B2
    participant HF as Hugging Face (ML Space)
    participant Neon as Neon PostgreSQL

    Note over D_Cron,D_Runner: 9:00 AM IST / 9:00 PM IST (Discovery Trigger)
    D_Cron->>D_Runner: Start workflow run
    D_Runner->>Apify: Crawl top Indian meme subreddits
    Apify-->>D_Runner: Return 50 candidate memes
    D_Runner->>D_Runner: Filter quality & score trends
    D_Runner->>Neon: Store discovery candidate rows
    D_Runner->>Upstash: Enqueue jobs to "meme-ingestion" queue
    D_Runner-->>D_Cron: Clean shutdown & exit (0)

    Note over I_Cron,I_Runner: Every 4 Hours (12:15, 4:15, 8:15 IST)
    I_Cron->>I_Runner: Start workflow run (concurrency locked)
    I_Runner->>Upstash: Pre-flight check: getJobCounts()
    alt Queue is Empty
        I_Runner-->>I_Cron: Log "Queue empty" & Exit 0 (< 2s)
    else Work Available
        I_Runner->>Neon: Ensure schema migrations (pgvector)
        loop Process each batch item (Concurrency = 2)
            I_Runner->>Upstash: Pop job (Candidate ID)
            I_Runner->>I_Runner: Download media & Sharp image validation
            I_Runner->>I_Runner: Compute SHA-256 and pHash
            I_Runner->>B2: Upload image (memes1386/ingestion/...)
            B2-->>I_Runner: Upload success (b2_key)
            I_Runner->>HF: POST /process-ingestion (b2_key, caption)
            Note over HF: EasyOCR text extraction + CLIP 512-d vector
            HF-->>I_Runner: Return OCR text & 512-d embedding
            I_Runner->>Neon: Insert ingestion_media & update candidate status = COMPLETED
            I_Runner->>Upstash: Mark BullMQ job completed
        end
        I_Runner->>Upstash: Verify wait=0 and active=0 (5s settle)
        I_Runner-->>I_Cron: Close connections & Exit 0
    end
```

---

## 3. Data Transformation Pipeline

| Stage | Input | Component | Output | Target Storage |
| :--- | :--- | :--- | :--- | :--- |
| **1. Discovery** | Subreddit posts | Apify Scraper | JSON metadata (title, URL, upvotes) | Neon DB (`discovery_candidates`) |
| **2. Enqueue** | Candidate metadata | BullMQ Producer | Queue Job with ID = `candidate_id` | Upstash Redis (`meme-ingestion`) |
| **3. Validation** | Media URL | HTTP fetch + Sharp | Validated image buffer (dimensions, JPEG/PNG) | In-memory Buffer |
| **4. Fingerprint** | Image Buffer | Crypto + pHash | `sha256_hash` + `phash` | Neon DB (`ingestion_media`) |
| **5. Storage** | Image Buffer | Backblaze B2 SDK | B2 Object Key (e.g., `ingestion/title_hash.jpg`) | Backblaze B2 (`memes1386`) |
| **6. Machine Learning**| B2 Object Key | Hugging Face Space | OCR text + 512-dimensional CLIP embedding | Neon DB (`vector(512)`) |
| **7. Final State** | Processing summary | Worker | Status `COMPLETED`, timestamp `ingested_at` | Neon DB (`ingestion_candidates`) |
