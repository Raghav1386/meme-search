const { Pool } = require('pg');
require('dotenv').config();

async function check() {
  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
  try {
    const res = await pool.query("SELECT proname, pg_get_function_arguments(oid) FROM pg_proc WHERE proname LIKE 'match_memes%';");
    console.log('NEON_DATABASE_URL functions:');
    console.table(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
check();
