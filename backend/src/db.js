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

export const queryMemes = async (embedding, format) => {
  try {
    let result;
    if (format && format !== 'all') {
      result = await pool.query(
        `
        SELECT b2_key, caption, format
        FROM memes
        WHERE format = $2
        ORDER BY embedding <=> $1::vector
        LIMIT 10;
        `,
        [JSON.stringify(embedding), format]
      );
    } else {
      result = await pool.query(
        `
        SELECT b2_key, caption, format
        FROM memes
        ORDER BY embedding <=> $1::vector
        LIMIT 10;
        `,
        [JSON.stringify(embedding)]
      );
    }

    return result.rows;
  } catch (err) {
    console.error("DB ERROR:", err);
    throw err;
  }
};