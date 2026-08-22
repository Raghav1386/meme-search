import { SourceAdapter } from './sourceAdapter.js';
import config from '../config/index.js';

export class MockSourceAdapter extends SourceAdapter {
  constructor() {
    super('mock');
  }

  get isEnabled() {
    return config.DISCOVERY_MOCK_SOURCE_ENABLED;
  }

  async fetch(context) {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));

    const rawCandidateA = {
      platform: '  MOCK  ', // Intentional un-normalized platform
      platform_content_id: 'm-001',
      media_url: 'https://example.com/valid.jpg',
      source_url: 'https://example.com/post/1',
      title: '  Valid   Meme  ',
      creator: 'test_user',
      engagement: { likes: 100 }
    };

    return [
      // TEST A: Valid candidate
      rawCandidateA,
      
      // TEST B: Missing platform
      {
        platform_content_id: 'm-002',
        media_url: 'https://example.com/valid.jpg',
        title: 'Missing Platform'
      },
      
      // TEST C: Missing platform_content_id
      {
        platform: 'mock',
        media_url: 'https://example.com/valid.jpg',
        title: 'Missing Content ID'
      },
      
      // TEST D: Invalid source URL
      {
        platform: 'mock',
        platform_content_id: 'm-004',
        media_url: 'https://example.com/valid.jpg',
        source_url: 'not-a-valid-url',
        title: 'Invalid Source URL'
      },
      
      // TEST E: Missing optional metadata
      {
        platform: 'mock',
        platform_content_id: 'm-005',
        media_url: 'https://example.com/valid.jpg'
        // Missing title, caption, creator
      },
      
      // TEST F: Incorrect engagement type
      {
        platform: 'mock',
        platform_content_id: 'm-006',
        media_url: 'https://example.com/valid.jpg',
        engagement: '100 likes' // Should be an object
      },

      // TEST G: Duplicate normalization of Candidate A
      // (This ensures deterministic ID generation when normalized twice)
      { ...rawCandidateA }
    ];
  }
}

export class MockFailSourceAdapter extends SourceAdapter {
  constructor() {
    super('mock-fail');
  }

  get isEnabled() {
    return config.DISCOVERY_MOCK_SOURCE_ENABLED && config.DISCOVERY_RUN_MODE === 'test';
  }

  async fetch(context) {
    throw new Error("Controlled mock failure for testing");
  }
}
