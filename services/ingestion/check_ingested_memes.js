import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const { Pool } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Multi-path dotenv resolution so it works from any directory
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../discovery/.env') });

const cleanEnv = (val, fallback = undefined) => {
  if (val === undefined || val === null) return fallback;
  const str = String(val).trim().replace(/^["']|["']$/g, '').trim();
  return str || fallback;
};

const dbUrl = cleanEnv(process.env.INGESTION_DATABASE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);
const redisUrl = cleanEnv(process.env.REDIS_URL);

async function checkIngestedMemes() {
  console.log('\n================================================================');
  console.log('              MEMESEARCH INGESTION STATUS REPORT                ');
  console.log('================================================================\n');

  // 1. Check BullMQ Redis Queue
  if (redisUrl) {
    try {
      const redisConnection = new Redis(redisUrl, {
        family: 0,
        maxRetriesPerRequest: null
      });
      const queue = new Queue('meme-ingestion', { connection: redisConnection });
      const counts = await queue.getJobCounts('wait', 'active', 'delayed', 'completed', 'failed');
      
      console.log('📦 BullMQ Queue Status (meme-ingestion):');
      console.log(`   - Waiting:   ${counts.wait || 0}`);
      console.log(`   - Active:    ${counts.active || 0}`);
      console.log(`   - Delayed:   ${counts.delayed || 0}`);
      console.log(`   - Completed: ${counts.completed || 0}`);
      console.log(`   - Failed:    ${counts.failed || 0}\n`);

      await queue.close();
      await redisConnection.quit();
    } catch (err) {
      console.log(`⚠️ Redis Queue check skipped: ${err.message}\n`);
    }
  }

  // 2. Check Database Ingestion Records
  if (!dbUrl) {
    console.error('❌ INGESTION_DATABASE_URL is not set in .env');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('sslmode=require') || dbUrl.includes('neon.tech') ? { rejectUnauthorized: false } : undefined
  });

  try {
    // Check if ingestion_candidates table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'ingestion_candidates'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('⚠️ Table "ingestion_candidates" does not exist yet.');
      return;
    }

    // Summary count by status
    const statusSummary = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM ingestion_candidates 
      GROUP BY status 
      ORDER BY count DESC;
    `);

    console.log('📊 Ingestion Candidates Summary:');
    statusSummary.rows.forEach(r => {
      const badge = r.status === 'COMPLETED' ? '✅' : (r.status === 'FAILED' ? '❌' : '⏳');
      console.log(`   ${badge} ${r.status.padEnd(12)}: ${r.count} memes`);
    });
    console.log('');

    // Fetch successfully completed memes with their timing
    const completedRes = await pool.query(`
      SELECT 
        c.candidate_id,
        c.caption,
        c.platform,
        c.status,
        c.ingested_at,
        c.created_at,
        m.b2_key,
        m.format,
        m.width,
        m.height,
        m.ocr_text
      FROM ingestion_candidates c
      LEFT JOIN ingestion_media m ON c.media_id = m.id
      WHERE c.status = 'COMPLETED'
      ORDER BY COALESCE(c.ingested_at, c.updated_at, c.created_at) DESC
      LIMIT 25;
    `);

    const totalCompleted = statusSummary.rows.find(r => r.status === 'COMPLETED')?.count || 0;
    console.log(`🎉 Total Successfully Ingested Memes: ${totalCompleted}`);
    console.log(`📋 Recent Ingested Memes (Showing latest ${completedRes.rows.length}):\n`);

    if (completedRes.rows.length === 0) {
      console.log('   (No completed memes found in database yet)');
    } else {
      completedRes.rows.forEach((row, i) => {
        const timestamp = row.ingested_at || row.created_at;
        const istTime = timestamp 
          ? new Date(timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' })
          : 'Unknown';
        
        const cleanCaption = (row.caption || 'No caption').replace(/\r?\n/g, ' ').substring(0, 50);
        const b2 = row.b2_key || 'No B2 key';
        const dims = row.width && row.height ? `${row.width}x${row.height}` : 'N/A';
        const ocrSnippet = row.ocr_text ? ` | OCR: "${row.ocr_text.substring(0, 30).replace(/\n/g, ' ')}..."` : '';

        console.log(`   ${String(i + 1).padStart(2, ' ')}. [${istTime} IST]`);
        console.log(`       Caption: ${cleanCaption}${cleanCaption.length >= 50 ? '...' : ''}`);
        console.log(`       File:    ${b2} (${dims})`);
        if (ocrSnippet) {
          console.log(`       Text:   ${ocrSnippet}`);
        }
        console.log('');
      });

      // Write GitHub Actions Step Summary if running in CI
      if (process.env.GITHUB_STEP_SUMMARY) {
        try {
          const fs = await import('fs');
          let summaryMd = `### 🚀 Ingestion Run Report\n\n`;
          summaryMd += `**Total Successfully Ingested:** ${totalCompleted}\n\n`;
          summaryMd += `| Status | Count |\n| :--- | :--- |\n`;
          statusSummary.rows.forEach(r => {
            const badge = r.status === 'COMPLETED' ? '✅' : (r.status === 'FAILED' ? '❌' : '⏳');
            summaryMd += `| ${badge} ${r.status} | **${r.count}** memes |\n`;
          });
          summaryMd += `\n#### 📋 Recent Ingested Memes (Latest ${Math.min(completedRes.rows.length, 10)})\n\n`;
          summaryMd += `| # | Time (IST) | File (B2 Key) | Dimensions | OCR Snippet |\n`;
          summaryMd += `| :-: | :--- | :--- | :--- | :--- |\n`;
          completedRes.rows.slice(0, 10).forEach((row, i) => {
            const timestamp = row.ingested_at || row.created_at;
            const istTime = timestamp ? new Date(timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'medium' }) : 'N/A';
            const b2 = (row.b2_key || 'N/A').replace('backend/memes/', '');
            const dims = row.width && row.height ? `${row.width}x${row.height}` : 'N/A';
            const ocr = (row.ocr_text || '').replace(/\r?\n/g, ' ').substring(0, 40);
            summaryMd += `| ${i + 1} | ${istTime} | \`${b2}\` | ${dims} | ${ocr}${ocr.length >= 40 ? '...' : ''} |\n`;
          });
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMd);
        } catch (e) {}
      }
    }

  } catch (err) {
    console.error('❌ Database query error:', err.message);
  } finally {
    await pool.end();
    console.log('================================================================\n');
  }
}

checkIngestedMemes().catch(console.error);
