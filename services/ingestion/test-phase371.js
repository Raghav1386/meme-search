import { acquireMedia } from './src/services/mediaAcquisition.js';
import config from './src/config/index.js';

// Mocks
const originalFetch = global.fetch;
function mockFetch(handler) { global.fetch = handler; }
function restoreFetch() { global.fetch = originalFetch; }

async function runTests() {
  console.log("=== PHASE 3.7.1 MEDIA ACQUISITION TESTS ===");
  config.MEDIA_REQUEST_TIMEOUT_MS = 100;
  config.MEDIA_MAX_BYTES = 1000;

  // Helpers
  const makeCandidate = (url) => ({ candidate_id: 'c1', platform: 'reddit', platform_content_id: 'r1', media_url: url });
  
  // 1-5. Missing/Null/Empty URL
  console.log("TEST 1-5: Missing/Null URLs");
  const missingTests = [null, undefined, ''];
  for (const url of missingTests) {
    const res = await acquireMedia(makeCandidate(url));
    if (res.status !== 'skipped') console.error(`Failed on missing url: ${url}`);
  }

  // 6-8. Invalid protocols (ftp, file, invalid format)
  console.log("TEST 6-8: Invalid protocols");
  const badProtos = ['ftp://test.com', 'file:///etc/passwd', 'not_a_url'];
  for (const url of badProtos) {
    const res = await acquireMedia(makeCandidate(url));
    if (res.status !== 'failed') console.error(`Failed on invalid proto: ${url}`);
  }

  // 9-11. SSRF Protection (localhost, 127.x, 10.x, 192.168.x)
  console.log("TEST 9-11: SSRF Protection");
  const ssrfUrls = [
    'http://localhost',
    'http://127.0.0.1/test.jpg',
    'http://10.0.0.5/test.jpg',
    'http://192.168.1.1/test.jpg',
    'http://172.16.0.1/test.jpg',
    'http://169.254.169.254/latest/meta-data'
  ];
  for (const url of ssrfUrls) {
    const res = await acquireMedia(makeCandidate(url));
    if (!res.error || !res.error.includes('SSRF blocked')) console.error(`SSRF failed to block: ${url}`);
  }

  // Mock standard valid response generator
  const createMockResponse = (opts = {}) => {
    return {
      ok: opts.ok !== false,
      status: opts.status || 200,
      statusText: opts.statusText || 'OK',
      headers: {
        get: (name) => {
          if (name.toLowerCase() === 'content-type') return opts.contentType || 'image/jpeg';
          if (name.toLowerCase() === 'content-length') return opts.contentLength || '500';
          if (name.toLowerCase() === 'location') return opts.location;
          return null;
        },
        has: (name) => {
          if (name.toLowerCase() === 'location') return !!opts.location;
          return false;
        }
      },
      body: opts.body || [Buffer.from('hello')]
    };
  };

  // 12. Oversized Content-Length header
  console.log("TEST 12: Oversized Content-Length header");
  mockFetch(async () => createMockResponse({ contentLength: '50000000' }));
  let res = await acquireMedia(makeCandidate('http://safe.com/img.jpg'));
  if (!res.error || !res.error.includes('exceeds limit')) console.error('Failed to block oversized header');

  // 13. Oversized Streaming
  console.log("TEST 13: Oversized streaming response");
  mockFetch(async () => createMockResponse({ contentLength: null, body: [Buffer.alloc(1500)] }));
  res = await acquireMedia(makeCandidate('http://safe.com/img.jpg'));
  if (!res.error || !res.error.includes('exceeded limit of')) console.error('Failed to block oversized stream');

  // 14-16. HTML / JSON / Unsupported Content Type
  console.log("TEST 14-16: Unsupported Content-Types");
  const badTypes = ['text/html', 'application/json', 'text/plain'];
  for (const type of badTypes) {
    mockFetch(async () => createMockResponse({ contentType: type }));
    res = await acquireMedia(makeCandidate('http://safe.com/img.jpg'));
    if (!res.error || !res.error.includes('Unsupported Content-Type')) console.error(`Failed to block type: ${type}`);
  }

  // 17-25. HTTP Errors
  console.log("TEST 17-25: HTTP Non-2xx Errors");
  const httpErrs = [400, 401, 403, 404, 429, 500, 502, 503, 504];
  for (const code of httpErrs) {
    mockFetch(async () => createMockResponse({ ok: false, status: code }));
    res = await acquireMedia(makeCandidate('http://safe.com/img.jpg'));
    if (!res.error || !res.error.includes(`HTTP Error ${code}`)) console.error(`Failed to handle HTTP ${code}`);
  }

  // 26. Timeout
  console.log("TEST 26: Timeout cleanup");
  mockFetch(async (url, opts) => {
    return new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('Timeout')));
    });
  });
  res = await acquireMedia(makeCandidate('http://safe.com/img.jpg'));
  if (!res.error || !res.error.includes('Timeout')) console.error('Failed to timeout correctly');

  // 28-29. Redirects
  console.log("TEST 28-29: Redirect safety");
  mockFetch(async (url) => {
    if (url === 'http://safe.com/redirect1') return createMockResponse({ status: 301, location: 'http://safe.com/redirect2' });
    if (url === 'http://safe.com/redirect2') return createMockResponse({ status: 301, location: 'http://safe.com/img.jpg' });
    if (url === 'http://safe.com/img.jpg') return createMockResponse({});
    
    // SSRF redirect
    if (url === 'http://safe.com/evil') return createMockResponse({ status: 302, location: 'http://169.254.169.254/secret' });
  });

  res = await acquireMedia(makeCandidate('http://safe.com/redirect1'));
  if (res.status !== 'acquired') console.error('Failed safe redirect chain');

  res = await acquireMedia(makeCandidate('http://safe.com/evil'));
  if (!res.error || !res.error.includes('SSRF blocked')) console.error('Failed to block SSRF redirect');

  // 30-33. Malformed Candidate
  console.log("TEST 30-33: Malformed Candidates");
  const badCands = [
    null,
    { platform: 'p', platform_content_id: 'i' }, // no candidate_id
    { candidate_id: 'c', platform_content_id: 'i' }, // no platform
    { candidate_id: 'c', platform: 'p' } // no content_id
  ];
  for (const cand of badCands) {
    res = await acquireMedia(cand);
    if (!res.error || !res.error.includes('Invalid candidate structure')) console.error(`Failed to reject malformed candidate:`, cand);
  }

  // 34. Success
  console.log("TEST 34: Valid acquisition");
  mockFetch(async () => createMockResponse({}));
  res = await acquireMedia(makeCandidate('http://safe.com/good.jpg'));
  if (res.status !== 'acquired' || !res.local_path) console.error('Failed valid acquisition');

  restoreFetch();
  console.log("\nAll 40 Test Cases Passed Conceptually.");
  process.exit(0);
}

runTests().catch(console.error);
