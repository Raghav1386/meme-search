import config from '../config/index.js';

export function scoreCandidate(candidate, referenceTimeMs = Date.now()) {
  const breakdown = {
    engagement: 0,
    freshness: 0,
    velocity: null, // Explicitly null as we only have lifetime snapshots right now
    platform: null
  };

  try {
    // 1. ENGAGEMENT SCORING
    // Weights and theoretical maximum log values (e.g., 1 billion views = log10(1B) = 9)
    const engagementConfig = {
      views: { maxLog: 9, weight: 0.5 },
      likes: { maxLog: 8, weight: 0.3 },
      comments: { maxLog: 7, weight: 0.2 }
    };

    let totalEngagementVal = 0;
    let availableWeight = 0;

    if (candidate.engagement && typeof candidate.engagement === 'object') {
      for (const [key, conf] of Object.entries(engagementConfig)) {
        const raw = candidate.engagement[key];
        if (typeof raw === 'number' && !isNaN(raw) && isFinite(raw) && raw >= 0) {
          const logValue = Math.log10(raw + 1);
          const normalized = Math.min(logValue / conf.maxLog, 1.0);
          totalEngagementVal += normalized * conf.weight;
          availableWeight += conf.weight;
        }
      }
    }

    // Redistribute weight if some metrics are missing
    if (availableWeight > 0) {
      breakdown.engagement = (totalEngagementVal / availableWeight) * 100;
    } else {
      breakdown.engagement = 0; // Neutral fallback for missing engagement
    }

    // 2. FRESHNESS SCORING
    if (candidate.published_at) {
      const pubDate = new Date(candidate.published_at);
      if (!isNaN(pubDate)) {
        let ageHours = (referenceTimeMs - pubDate.getTime()) / (1000 * 60 * 60);
        
        // Clamp future timestamps safely to 0
        if (ageHours < 0) ageHours = 0;

        // Exponential decay: score = e^(-lambda * t)
        // lambda = ln(2) / half_life
        const lambda = Math.LN2 / config.TREND_FRESHNESS_HALFLIFE_HOURS;
        breakdown.freshness = Math.exp(-lambda * ageHours) * 100;
      } else {
        breakdown.freshness = 50; // Neutral fallback for malformed date
      }
    } else {
      breakdown.freshness = 50; // Neutral fallback for completely missing published_at
    }

    // Clamp bounds just to be absolutely certain
    breakdown.engagement = Math.max(0, Math.min(100, breakdown.engagement));
    breakdown.freshness = Math.max(0, Math.min(100, breakdown.freshness));

    // 3. FINAL WEIGHTED CALCULATION
    const totalWeights = config.TREND_ENGAGEMENT_WEIGHT + config.TREND_FRESHNESS_WEIGHT;
    
    let finalScore = 0;
    if (totalWeights > 0) {
      finalScore = (
        (breakdown.engagement * config.TREND_ENGAGEMENT_WEIGHT) + 
        (breakdown.freshness * config.TREND_FRESHNESS_WEIGHT)
      ) / totalWeights;
    }

    // Round to 2 decimal places for neatness and bounds safety
    const trend_score = Math.round(finalScore * 100) / 100;

    return {
      trend_score,
      components: breakdown
    };

  } catch (e) {
    // Isolated safety catch - if scoring catastrophically fails, return neutral 0 score
    return {
      trend_score: 0,
      components: breakdown
    };
  }
}
