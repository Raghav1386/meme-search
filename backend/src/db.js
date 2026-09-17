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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const initializeDB = async () => {
  try {
    console.log("Ensuring database schema is up-to-date...");
    const sqlPath = path.join(__dirname, '..', 'sql', 'match_memes.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log("Database schema ready.");
  } catch (err) {
    console.error("Failed to initialize DB schema:", err.message);
  }
};

export const queryMemes = async (queryText, embedding, format) => {
  try {
    const filterFormat = format && format !== 'all' ? format : null;
    const vectorParam = embedding && Array.isArray(embedding) ? JSON.stringify(embedding) : null;
    const textParam = queryText && typeof queryText === 'string' && queryText.trim() ? queryText.trim() : null;

    const result = await pool.query(
      `
      SELECT id, b2_key, caption, ocr_text, format, score, created_at
      FROM match_memes_hybrid($1::text, $2::vector(512), 12, $3::text);
      `,
      [textParam, vectorParam, filterFormat]
    );

    return result.rows;
  } catch (err) {
    console.error("DB ERROR:", err);
    throw err;
  }
};