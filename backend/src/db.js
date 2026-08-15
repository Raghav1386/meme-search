import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export const queryMemes = async (queryText, embedding, format) => {
  try {
    const filterFormat = format && format !== 'all' ? format : null;
    const vectorParam = embedding && Array.isArray(embedding) ? JSON.stringify(embedding) : null;
    const textParam = queryText && typeof queryText === 'string' && queryText.trim() ? queryText.trim() : null;

    const result = await pool.query(
      `
      SELECT id, b2_key, caption, ocr_text, format, score
      FROM match_memes_hybrid($1, $2::vector, 12, $3);
      `,
      [textParam, vectorParam, filterFormat]
    );

    return result.rows;
  } catch (err) {
    console.error("DB ERROR:", err);
    throw err;
  }
};