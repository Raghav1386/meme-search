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

export const queryMemes = async (embedding) => {
  try {
    console.log("Embedding length:", embedding.length);

    const result = await pool.query(
      `
      SELECT b2_key, caption, format
      FROM memes
      ORDER BY embedding <=> $1::vector
      LIMIT 10;
      `,
      [JSON.stringify(embedding)] // 🔥 VERY IMPORTANT
    );

    return result.rows;
  } catch (err) {
    console.error("DB ERROR:", err);
    throw err;
  }
};