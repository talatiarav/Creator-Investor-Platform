// pipeline.ts
// Orchestrates brand analysis for a connected influencer:
//   1. Fetch profile + posts from Graph API
//   2. Analyze each image through Claude vision (batched)
//   3. Aggregate into a brand profile
//   4. Score against a business profile

import "dotenv/config";
import { getInfluencerProfile, getRecentMedia, getAccountInsights } from "./instagramClient";
import { analyzePost, aggregateBrandProfile, matchInfluencerToBusiness } from "./brandAnalyzer";
import { InfluencerRecord, InfluencerTier, EngagementQuality, BusinessProfile } from "./types";

function getInfluencerTier(followers: number): InfluencerTier {
  if (followers < 10_000) return "Nano (< 10K)";
  if (followers < 100_000) return "Micro (10K-100K)";
  if (followers < 500_000) return "Mid-tier (100K-500K)";
  if (followers < 1_000_000) return "Macro (500K-1M)";
  return "Mega (1M+)";
}

function getEngagementQuality(rate: number): EngagementQuality {
  if (rate >= 5) return "High";
  if (rate >= 2) return "Average";
  return "Below Average";
}

interface BuildProfileOptions {
  postLimit?: number;
  concurrency?: number;
}

export async function buildInfluencerProfile(
  accessToken: string,
  options: BuildProfileOptions = {}
): Promise<InfluencerRecord> {
  const { postLimit = 12, concurrency = 3 } = options;

  console.log("Fetching Instagram profile...");
  const [profile, posts, insights] = await Promise.all([
    getInfluencerProfile(accessToken),
    getRecentMedia(accessToken, postLimit),
    getAccountInsights(accessToken).catch(() => null),
  ]);

  console.log(`Found ${posts.length} image posts for @${profile.username}`);
  if (posts.length === 0) throw new Error("No image posts found — cannot build brand profile.");

  // Batch analysis — controls API cost and rate limits
  // Cost: ~$0.01-0.015/image with Claude Sonnet = ~$0.12-0.18 per profile
  const postAnalyses = [];
  for (let i = 0; i < posts.length; i += concurrency) {
    const batch = posts.slice(i, i + concurrency);
    console.log(`Analyzing posts ${i + 1}–${Math.min(i + concurrency, posts.length)} of ${posts.length}...`);

    const results = await Promise.all(
      batch.map((post) =>
        analyzePost(post.media_url ?? "", post.caption).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.warn(`Failed to analyze post ${post.id}: ${msg}`);
          return null;
        })
      )
    );

    postAnalyses.push(...results);
    if (i + concurrency < posts.length) {
      await new Promise<void>((r) => setTimeout(r, 500));
    }
  }

  const brandProfile = aggregateBrandProfile(postAnalyses);

  const totalEngagement = posts.reduce(
    (sum, p) => sum + (p.like_count ?? 0) + (p.comments_count ?? 0), 0
  );
  const avgEngagementPerPost = posts.length > 0 ? totalEngagement / posts.length : 0;
  const engagementRate = profile.followers_count > 0
    ? (avgEngagementPerPost / profile.followers_count) * 100
    : 0;

  return {
    instagram: {
      id: profile.id,
      username: profile.username,
      name: profile.name,
      biography: profile.biography,
      website: profile.website,
      profile_picture_url: profile.profile_picture_url,
      followers_count: profile.followers_count,
      follows_count: profile.follows_count,
      media_count: profile.media_count,
    },
    reach: {
      follower_count: profile.followers_count,
      tier: getInfluencerTier(profile.followers_count),
      engagement_rate_pct: Math.round(engagementRate * 100) / 100,
      engagement_quality: getEngagementQuality(engagementRate),
      monthly_reach: insights?.reach ?? null,
      monthly_impressions: insights?.impressions ?? null,
    },
    brand: brandProfile,
    meta: {
      profile_built_at: new Date().toISOString(),
      posts_analyzed: postAnalyses.filter(Boolean).length,
      data_source: "instagram_graph_api_connected",
    },
  };
}

// Run directly for testing
if (require.main === module) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    console.log("Set INSTAGRAM_ACCESS_TOKEN to run the pipeline.");
    process.exit(0);
  }

  const exampleBusiness: BusinessProfile = {
    primary_category: "Health & Fitness",
    aesthetic: "Natural & Earthy",
    likely_audience: "Millennials (25-34)",
    tone: "Inspirational",
    secondary_category: "Sustainability & Eco",
  };

  buildInfluencerProfile(token)
    .then((profile) => {
      console.log("\nProfile:", JSON.stringify(profile, null, 2));
      console.log("\nMatch:", JSON.stringify(matchInfluencerToBusiness(profile, exampleBusiness), null, 2));
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}

export { matchInfluencerToBusiness };
