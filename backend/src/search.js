import express from "express";
import { getEmbedding } from "./embed.js";
import { queryMemes } from "./db.js";
import { searchIngestionMemes } from "./ingestion.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const query = req.query.q;
    const format = req.query.format;

    if (!query) {
      return res.status(400).json({ error: "Query required" });
    }

    // 1. Convert query → embedding (with soft fallback if embedding service fails)
    let embedding = null;
    try {
      embedding = await getEmbedding(query);
    } catch (embedErr) {
      console.warn("Embedding service unavailable, falling back to text search:", embedErr.message);
    }

    // 2. Search DBs (Federated search with graceful fallback)
    const memesPromise = queryMemes(query, embedding, format);
    const ingestionMemesPromise = searchIngestionMemes(query, format).catch((err) => {
      console.warn("Ingestion DB search failed, but gracefully continuing:", err.message);
      return [];
    });

    const [memes, ingestionMemes] = await Promise.all([memesPromise, ingestionMemesPromise]);

    // 3. Attach Proxy URLs for images, add discriminators, and merge
    const existingResults = memes.map((m) => ({
      ...m,
      caption: m.caption || "",
      ocr_text: m.ocr_text || "",
      url: `/api/image?key=${encodeURIComponent(m.b2_key)}`,
      result_type: 'meme',
      ingested_at: m.created_at
    }));

    const ingestionResults = ingestionMemes.map((m) => ({
      ...m,
      caption: m.caption || "",
      ocr_text: m.ocr_text || "",
      url: `/api/image?key=${encodeURIComponent(m.b2_key)}`,
      platform: m.source,
      result_type: 'ingestion'
    }));

    // Combine and sort by the normalized scores
    const combinedResults = [...ingestionResults, ...existingResults].sort((a, b) => b.score - a.score);

    res.json(combinedResults);
  } catch (err) {
    console.error("FULL ERROR:", err);
    res.status(500).json({
      error: err.message,
      stack: err.stack,
    });
  }
});

export default router;