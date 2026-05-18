import express from "express";
import { getEmbedding } from "./embed.js";
import { queryMemes } from "./db.js";
import { getB2Url } from "./b2url.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const query = req.query.q;

    if (!query) {
      return res.status(400).json({ error: "Query required" });
    }

    // 1. Convert query → embedding
    const embedding = await getEmbedding(query);

    // 2. Search DB
    const memes = await queryMemes(embedding);

    // 3. Attach B2 URLs
    const results = memes.map((m) => ({
      ...m,
      url: getB2Url(m.b2_key),
    }));

    res.json(results);
  } catch (err) {
  console.error("FULL ERROR:", err);
  res.status(500).json({
    error: err.message,
    stack: err.stack
  });
}
});

export default router;