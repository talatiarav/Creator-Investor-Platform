// brandAnalyzer.ts
// Uses Claude's vision API to classify Instagram post images
// into a fixed brand taxonomy. Aggregates post-level results
// into a single brand profile and scores fit against a business profile.

import Anthropic from "@anthropic-ai/sdk";
import {
  PostAnalysis, BrandProfile, BusinessProfile, MatchResult,
  ContentCategory, AestheticStyle, AudienceType, ContentTone,
  ContentStyle, ProductionQuality, EngagementQuality, InfluencerRecord,
} from "./types";

const client = new Anthropic();

// Fixed taxonomy — kept as const arrays so they can be used in prompts
// and also referenced at runtime for validation
const CATEGORIES: ContentCategory[] = [
  "Fashion & Style", "Beauty & Skincare", "Health & Fitness",
  "Food & Cooking", "Travel & Adventure", "Home & Interior Design",
  "Technology & Gaming", "Parenting & Family", "Finance & Business",
  "Art & Creativity", "Sustainability & Eco", "Entertainment & Pop Culture",
  "Sports & Outdoors", "Pets & Animals", "Education & Self-Development",
];

const AESTHETICS: AestheticStyle[] = [
  "Minimalist & Clean", "Vibrant & Colourful", "Dark & Moody",
  "Natural & Earthy", "Luxury & High-End", "Casual & Authentic",
  "Professional & Corporate", "Artistic & Creative", "Playful & Fun", "Vintage & Retro",
];

const AUDIENCES: AudienceType[] = [
  "Gen Z (18-24)", "Millennials (25-34)", "Parents (30-45)",
  "Professionals (25-45)", "Seniors (50+)", "Broad / Mixed",
];

const TONES: ContentTone[] = [
  "Inspirational", "Educational", "Humorous", "Aspirational",
  "Authentic & Raw", "Promotional", "Community-Focused",
];

// ── Single post analysis ──────────────────────────────────────────────────────
export async function analyzePost(
  imageUrl: string,
  caption = ""
): Promise<PostAnalysis | null> {
  const prompt = `You are analyzing an Instagram post to classify a content creator's brand identity.

${caption ? `Post caption: "${caption.slice(0, 300)}"` : "No caption provided."}

Analyze the image and return a JSON object with exactly these fields:
{
  "primary_category": "<one value from: ${CATEGORIES.join(", ")}>",
  "secondary_category": "<one value from the same list, or null>",
  "aesthetic": "<one value from: ${AESTHETICS.join(", ")}>",
  "likely_audience": "<one value from: ${AUDIENCES.join(", ")}>",
  "tone": "<one value from: ${TONES.join(", ")}>",
  "content_style": "<one of: 'People-Focused', 'Product-Focused', 'Lifestyle', 'Educational', 'Behind-the-Scenes'>",
  "production_quality": "<one of: 'Professional Studio', 'High-Quality Candid', 'Casual / UGC-style'>",
  "key_signals": ["<2-4 short specific observations>"],
  "confidence": <number 0-1>
}

Return only the JSON object. No preamble, no markdown.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "url", url: imageUrl } },
        { type: "text", text: prompt },
      ],
    }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;

  try {
    return JSON.parse(textBlock.text.trim()) as PostAnalysis;
  } catch {
    console.warn(`Failed to parse vision response for: ${imageUrl}`);
    return null;
  }
}

// ── Aggregate post analyses into a brand profile ──────────────────────────────
export function aggregateBrandProfile(postAnalyses: Array<PostAnalysis | null>): BrandProfile {
  const valid = postAnalyses.filter(
    (p): p is PostAnalysis => p !== null && p.confidence >= 0.4
  );

  if (valid.length === 0) {
    return {
      primary_category: null, secondary_category: null,
      aesthetic: null, likely_audience: null, tone: null,
      content_style: null, production_quality: null,
      top_signals: [], posts_analyzed: 0, avg_confidence: 0,
      error: "Insufficient analyzable posts",
    };
  }

  // Weighted frequency counter — posts with higher confidence votes weigh more
  function dominantValue<T extends string>(field: keyof PostAnalysis): T | null {
    const counts = new Map<string, number>();
    for (const post of valid) {
      const val = post[field];
      if (!val || Array.isArray(val) || typeof val === "number") continue;
      counts.set(val, (counts.get(val) ?? 0) + post.confidence);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return (sorted[0]?.[0] as T) ?? null;
  }

  const allSignals = valid.flatMap((p) => p.key_signals);
  const signalCounts = new Map<string, number>();
  for (const sig of allSignals) {
    const key = sig.toLowerCase().trim();
    signalCounts.set(key, (signalCounts.get(key) ?? 0) + 1);
  }

  const topSignals = [...signalCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([sig]) => sig);

  const avgConfidence = valid.reduce((sum, p) => sum + p.confidence, 0) / valid.length;

  return {
    primary_category: dominantValue<ContentCategory>("primary_category"),
    secondary_category: dominantValue<ContentCategory>("secondary_category"),
    aesthetic: dominantValue<AestheticStyle>("aesthetic"),
    likely_audience: dominantValue<AudienceType>("likely_audience"),
    tone: dominantValue<ContentTone>("tone"),
    content_style: dominantValue<ContentStyle>("content_style"),
    production_quality: dominantValue<ProductionQuality>("production_quality"),
    top_signals: topSignals,
    posts_analyzed: valid.length,
    avg_confidence: Math.round(avgConfidence * 100) / 100,
  };
}

// ── Score brand fit between influencer and business ───────────────────────────
interface FitScoreResult {
  score: number;
  max_score: number;
  breakdown: MatchResult["brand_breakdown"];
}

export function scoreBrandFit(
  influencerProfile: BrandProfile,
  businessProfile: BusinessProfile
): FitScoreResult {
  const weights: Partial<Record<keyof BrandProfile, number>> = {
    primary_category: 35,
    aesthetic: 25,
    likely_audience: 20,
    tone: 10,
    secondary_category: 10,
  };

  let earned = 0;
  const breakdown: MatchResult["brand_breakdown"] = {};

  for (const [field, weight] of Object.entries(weights) as [keyof BrandProfile, number][]) {
    const influencerVal = influencerProfile[field] as string | null;
    const businessVal = businessProfile[field as keyof BusinessProfile] as string | undefined;
    if (!influencerVal || !businessVal) continue;

    const matched = influencerVal === businessVal;
    earned += matched ? weight : 0;

    breakdown[field] = {
      influencer: influencerVal,
      business: businessVal,
      matched,
      points_earned: matched ? weight : 0,
      points_possible: weight,
    };
  }

  return {
    score: Math.round(earned),
    max_score: Object.values(weights).reduce((a, b) => a + b, 0),
    breakdown,
  };
}

// ── Match influencer to business, incorporating engagement ───────────────────
export function matchInfluencerToBusiness(
  influencerRecord: InfluencerRecord,
  businessProfile: BusinessProfile
): MatchResult {
  const fitResult = scoreBrandFit(influencerRecord.brand, businessProfile);

  const engagementMultipliers: Record<EngagementQuality, number> = {
    High: 1.0,
    Average: 0.9,
    "Below Average": 0.75,
  };

  const multiplier = engagementMultipliers[influencerRecord.reach.engagement_quality] ?? 0.85;

  return {
    influencer_username: influencerRecord.instagram.username,
    fit_score: Math.round(fitResult.score * multiplier),
    brand_score: fitResult.score,
    engagement_quality: influencerRecord.reach.engagement_quality,
    tier: influencerRecord.reach.tier,
    followers: influencerRecord.reach.follower_count,
    engagement_rate: influencerRecord.reach.engagement_rate_pct,
    brand_breakdown: fitResult.breakdown,
    top_signals: influencerRecord.brand.top_signals,
    matched_at: new Date().toISOString(),
  };
}
