const { Pool } = require('pg');
require('dotenv').config();

async function check() {
  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
  try {
    const textParam = 'cat';
    const vectorParam = null;
    const filterFormat = null;
    const result = await pool.query(
      `
      SELECT id, b2_key, caption, ocr_text, format, score, created_at
      FROM match_memes_hybrid($1::text, $2::vector(512), 12, $3::text, 60);
      `,
      [textParam, vectorParam, filterFormat]
    );
    console.log('SUCCESS! Got rows:', result.rows.length);
  } catch(e) {
    console.error(e.message);
  } finally {
    pool.end();
  }
}
check();
