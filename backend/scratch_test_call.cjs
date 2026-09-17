const { Pool } = require('pg');
require('dotenv').config();

async function check() {
  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
  try {
    const res = await pool.query(`SELECT * FROM match_memes_hybrid('cat'::text, NULL::vector, 12, NULL::text);`);
    console.log('SUCCESS');
  } catch(e) {
    console.error(e.message);
  } finally {
    pool.end();
  }
}
check();
