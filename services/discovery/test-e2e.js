import { runDiscovery } from './src/core/discovery.js';
import { initQueue, closeQueue } from './src/queue/producer.js';

async function e2e() {
  console.log("=== STARTING END-TO-END DISCOVERY TEST ===");
  initQueue();
  
  const results = await runDiscovery();
  
  console.log("\n--- PIPELINE RESULTS ---");
  console.log(JSON.stringify(results, null, 2));

  await closeQueue();
  process.exit(0);
}

e2e().catch(console.error);
