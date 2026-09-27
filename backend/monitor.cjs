const { Pool } = require('pg');
require('dotenv').config();

async function monitor() {
  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
  
  console.log("=========================================");
  console.log("🚀 LIVE MEME INGESTION MONITOR STARTED 🚀");
  console.log("=========================================\n");
  
  let lastCount = null;
  
  setInterval(async () => {
    try {
      const res = await pool.query('SELECT COUNT(*) as count FROM memes');
      const currentCount = parseInt(res.rows[0].count, 10);
      
      if (lastCount === null) {
        console.log(`[${new Date().toLocaleTimeString()}] Total Memes in Database: ${currentCount}`);
      } else {
        const diff = currentCount - lastCount;
        if (diff > 0) {
          console.log(`[${new Date().toLocaleTimeString()}] Total Memes: ${currentCount} (🔥 Added ${diff} new memes in the last 10 seconds!)`);
        } else {
          console.log(`[${new Date().toLocaleTimeString()}] Total Memes: ${currentCount} (Still processing...)`);
        }
      }
      
      lastCount = currentCount;
    } catch(e) {
      console.error("Database connection error:", e.message);
    }
  }, 10000); // Check every 10 seconds
}

monitor();
