import express from "express";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

// Dedicated connection pool for the ingestion DB, keeping it isolated from MemeSearch DB
const pool = new pg.Pool({
  connectionString: process.env.INGESTION_DATABASE_URL,
});

router.get("/memes", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    // Only fetch COMPLETED records to ensure incomplete memes are never exposed
    const query = `
      SELECT 
        c.candidate_id, 
        c.caption, 
        c.platform, 
        c.source_media_url, 
        c.created_at,
        c.ingested_at,
        m.b2_key, 
        m.ocr_text, 
        m.format
      FROM ingestion_candidates c
      JOIN ingestion_media m ON c.media_id = m.id
      WHERE c.status = 'COMPLETED'
      ORDER BY c.created_at DESC
      LIMIT $1
    `;
    
    const result = await pool.query(query, [limit]);

    // Map to the existing frontend format. 
    // IMPORTANT: The URL points to the secure proxy (/api/image) to keep B2 bucket private.
    const items = result.rows.map((m) => ({
      ...m,
      caption: m.caption || "",
      ocr_text: m.ocr_text || "",
      url: `/api/image?key=${encodeURIComponent(m.b2_key)}`,
    }));

    res.json(items);
  } catch (err) {
  console.error("FULL ERROR fetching ingestion memes:", err);

  res.status(500).json({
    error: err.message,
    code: err.code,
    detail: err.detail,
    hint: err.hint,
  });
}
});

export const searchIngestionMemes = async (queryText, format) => {
  try {
    const filterFormat = format && format !== 'all' ? format : null;
    
    // We use a simple full-text search combined with ILIKE for robustness.
    // We assign an artificial score so they can be seamlessly merged with MemeSearch scores.
    const isAllUnits = queryText === 'ALL_UNITS';
    const query = `
      SELECT 
        c.candidate_id as id, 
        c.caption, 
        c.platform as source, 
        c.created_at,
        c.ingested_at,
        m.b2_key, 
        m.ocr_text, 
        m.format,
        ${isAllUnits ? '10.0' : `(
          ts_rank(to_tsvector('english', coalesce(c.caption, '')), plainto_tsquery('english', $1)) +
          ts_rank(to_tsvector('english', coalesce(m.ocr_text, '')), plainto_tsquery('english', $1))
        )`} as score
      FROM ingestion_candidates c
      JOIN ingestion_media m ON c.media_id = m.id
      WHERE c.status = 'COMPLETED'
        AND ($2::text IS NULL OR m.format = $2)
        ${isAllUnits ? '' : `AND (
          c.caption ILIKE $3 OR 
          m.ocr_text ILIKE $3 OR
          to_tsvector('english', coalesce(c.caption, '')) @@ plainto_tsquery('english', $1) OR
          to_tsvector('english', coalesce(m.ocr_text, '')) @@ plainto_tsquery('english', $1)
        )`}
      ORDER BY ${isAllUnits ? 'c.ingested_at DESC NULLS LAST' : 'score DESC'}
      LIMIT 10
    `;
    
    const ilikeParam = `%${queryText}%`;
    const result = await pool.query(query, [queryText, filterFormat, ilikeParam]);
    return result.rows;
  } catch (err) {
    console.error("INGESTION DB ERROR:", err);
    throw err;
  }
};

export default router;
