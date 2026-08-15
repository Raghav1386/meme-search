import express from "express";
import { getEmbedding } from "./embed.js";
import { queryMemes } from "./db.js";

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

    // 2. Search DB (Hybrid Search combining query text + vector embedding)
    const memes = await queryMemes(query, embedding, format);

    // 3. Attach Proxy URLs for images and format response
    const results = memes.map((m) => ({
      ...m,
      caption: m.caption || "",
      ocr_text: m.ocr_text || "",
      url: `/api/image?key=${encodeURIComponent(m.b2_key)}`,
    }));

    res.json(results);
  } catch (err) {
    console.error("FULL ERROR:", err);
    res.status(500).json({
      error: err.message,
      stack: err.stack,
    });
  }
});

export default router;