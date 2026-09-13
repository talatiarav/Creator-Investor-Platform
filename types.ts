// types.ts
// Shared type definitions used across all three services.
// These are the contracts between your services — changing a type here
// surfaces every callsite that needs updating, which is exactly what
// TypeScript is for. In a monorepo you'd publish this as a shared package.

// ─────────────────────────────────────────────────────────────────────────────
// OAuth / Token types
// ─────────────────────────────────────────────────────────────────────────────

export interface TokenRecord {
  accessToken: string;
  expiresAt: string;           // ISO 8601 timestamp
  instagramUserId: string;
  username: string;
  connectedAt: string;         // ISO 8601 timestamp
}

export interface SaveTokenParams {
  accessToken: string;
  expiresInSeconds: number;
  instagramUserId: string;
  username: string;
}

export interface ConnectionStatus {
  connected: boolean;
  influencerId: string;
  username?: string;
  instagramUserId?: string;
  connectedAt?: string;
  tokenExpiresAt?: string;
  daysUntilExpiry?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Instagram Graph API types
// ─────────────────────────────────────────────────────────────────────────────

export interface InstagramProfile {
  id: string;
  username: string;
  name: string;
  biography: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
  website?: string;
  profile_picture_url?: string;
}

export type MediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";

export interface InstagramPost {
  id: string;
  media_type: MediaType;
  media_url?: string;
  thumbnail_url?: string;
  caption?: string;
  like_count: number;
  comments_count: number;
  timestamp: string;
  permalink: string;
}

export interface AccountInsights {
  reach?: number;
  impressions?: number;
  profile_views?: number;
  follower_count?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand taxonomy types
// ─────────────────────────────────────────────────────────────────────────────

export type ContentCategory =
  | "Fashion & Style"
  | "Beauty & Skincare"
  | "Health & Fitness"
  | "Food & Cooking"
  | "Travel & Adventure"
  | "Home & Interior Design"
  | "Technology & Gaming"
  | "Parenting & Family"
  | "Finance & Business"
  | "Art & Creativity"
  | "Sustainability & Eco"
  | "Entertainment & Pop Culture"
  | "Sports & Outdoors"
  | "Pets & Animals"
  | "Education & Self-Development";

export type AestheticStyle =
  | "Minimalist & Clean"
  | "Vibrant & Colourful"
  | "Dark & Moody"
  | "Natural & Earthy"
  | "Luxury & High-End"
  | "Casual & Authentic"
  | "Professional & Corporate"
  | "Artistic & Creative"
  | "Playful & Fun"
  | "Vintage & Retro";

export type AudienceType =
  | "Gen Z (18-24)"
  | "Millennials (25-34)"
  | "Parents (30-45)"
  | "Professionals (25-45)"
  | "Seniors (50+)"
  | "Broad / Mixed";

export type ContentTone =
  | "Inspirational"
  | "Educational"
  | "Humorous"
  | "Aspirational"
  | "Authentic & Raw"
  | "Promotional"
  | "Community-Focused";

export type ContentStyle =
  | "People-Focused"
  | "Product-Focused"
  | "Lifestyle"
  | "Educational"
  | "Behind-the-Scenes";

export type ProductionQuality =
  | "Professional Studio"
  | "High-Quality Candid"
  | "Casual / UGC-style";

export type EngagementQuality = "High" | "Average" | "Below Average";

export type InfluencerTier =
  | "Nano (< 10K)"
  | "Micro (10K-100K)"
  | "Mid-tier (100K-500K)"
  | "Macro (500K-1M)"
  | "Mega (1M+)";

// ─────────────────────────────────────────────────────────────────────────────
// Brand analysis types
// ─────────────────────────────────────────────────────────────────────────────

// Raw output from analyzing a single post image
export interface PostAnalysis {
  primary_category: ContentCategory;
  secondary_category: ContentCategory | null;
  aesthetic: AestheticStyle;
  likely_audience: AudienceType;
  tone: ContentTone;
  content_style: ContentStyle;
  production_quality: ProductionQuality;
  key_signals: string[];
  confidence: number;          // 0-1
}

// Aggregated profile derived from multiple post analyses
export interface BrandProfile {
  primary_category: ContentCategory | null;
  secondary_category: ContentCategory | null;
  aesthetic: AestheticStyle | null;
  likely_audience: AudienceType | null;
  tone: ContentTone | null;
  content_style: ContentStyle | null;
  production_quality: ProductionQuality | null;
  top_signals: string[];
  posts_analyzed: number;
  avg_confidence: number;
  error?: string;
}

// Business owner's self-described brand profile (used for matching)
export interface BusinessProfile {
  primary_category: ContentCategory;
  aesthetic: AestheticStyle;
  likely_audience: AudienceType;
  tone: ContentTone;
  secondary_category?: ContentCategory;
}

// Full influencer record stored in your database
export interface InfluencerRecord {
  instagram: {
    id: string;
    username: string;
    name: string;
    biography: string;
    website?: string;
    profile_picture_url?: string;
    followers_count: number;
    follows_count: number;
    media_count: number;
  };
  reach: {
    follower_count: number;
    tier: InfluencerTier;
    engagement_rate_pct: number;
    engagement_quality: EngagementQuality;
    monthly_reach: number | null;
    monthly_impressions: number | null;
  };
  brand: BrandProfile;
  meta: {
    profile_built_at: string;
    posts_analyzed: number;
    data_source: "instagram_graph_api_connected" | "business_discovery" | "video_pipeline";
  };
}

// Result of matching an influencer against a business profile
export interface MatchResult {
  influencer_username: string;
  fit_score: number;           // 0-100, shown as "85% match"
  brand_score: number;         // raw score before engagement adjustment
  engagement_quality: EngagementQuality;
  tier: InfluencerTier;
  followers: number;
  engagement_rate: number;
  brand_breakdown: Record<string, {
    influencer: string;
    business: string;
    matched: boolean;
    points_earned: number;
    points_possible: number;
  }>;
  top_signals: string[];
  matched_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deal / smart contract types
// ─────────────────────────────────────────────────────────────────────────────

export type DealPlatformStatus =
  | "deployed"
  | "funded"
  | "active"
  | "complete"
  | "refunded"
  | "overdue";

export type OnChainStatus = "Draft" | "Funded" | "Active" | "Refunded" | "Complete";

export interface DeployDealParams {
  dealId: string;
  investorAddress: string;     // Ethereum wallet address (0x...)
  investeeAddress: string;     // Ethereum wallet address (0x...)
  principalUSDC: number;       // whole dollars, e.g. 5000
  returnAmountUSDC: number;    // whole dollars, e.g. 5500
  lockDays: number;
  acceptanceDays?: number;     // default 7
  investorEmail: string;
  influencerEmail: string;
  influencerUsername: string;
  investorName: string;
}

export interface DealRecord extends DeployDealParams {
  id: string;
  contractAddress: string;
  deployTxHash: string;
  acceptanceDeadline: string;   // ISO 8601
  repaymentDeadline: string;    // ISO 8601
  platformStatus: DealPlatformStatus;
  deployedAt: string;
  fundedAt: string | null;
  activatedAt: string | null;
  completedAt: string | null;
  repaidUSDC?: number;
  overdueNotifiedAt?: string;
}

export interface OnChainDealState {
  dealId: string;
  contractAddress: string;
  onChainStatus: OnChainStatus;
  platformStatus: DealPlatformStatus;
  principalUSDC: number;
  returnAmountUSDC: number;
  amountRepaidUSDC: number;
  amountOwedUSDC: number;
  repaymentProgress: number;   // 0-100 percentage
  isOverdue: boolean;
  acceptanceDeadline: string;
  repaymentDeadline: string;
  explorerUrl: string;
}

// API response shapes
export interface DeployDealResponse {
  success: true;
  deal: {
    id: string;
    contractAddress: string;
    deployTxHash: string;
    platformStatus: DealPlatformStatus;
    explorerUrl: string;
    acceptanceDeadline: string;
    repaymentDeadline: string;
  };
}

export interface ApiError {
  error: string;
  fields?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification payload types
// ─────────────────────────────────────────────────────────────────────────────

export interface NotifyContractDeployedParams {
  investorEmail: string;
  influencerUsername: string;
  deal: DealRecord;
}

export interface NotifyContractFundedParams {
  influencerEmail: string;
  investorName: string;
  deal: DealRecord;
}

export interface NotifyDealActivatedParams {
  investorEmail: string;
  influencerUsername: string;
  deal: DealRecord;
}

export interface NotifyDealExpiredParams {
  investorEmail: string;
  influencerUsername: string;
  deal: DealRecord;
}

export interface NotifyRepaymentCompleteParams {
  investorEmail: string;
  influencerUsername: string;
  deal: DealRecord;
}

export interface NotifyDealOverdueParams {
  investorEmail: string;
  influencerEmail: string;
  influencerUsername: string;
  deal: DealRecord;
}
