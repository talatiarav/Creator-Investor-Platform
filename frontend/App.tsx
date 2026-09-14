import React, { useState, useCallback } from "react";
import { ethers } from "ethers";

// ─── Types ────────────────────────────────────────────────────────────────────

type Page = "profile" | "browse" | "deal";

type ContentCategory =
  | "Fashion & Style" | "Beauty & Skincare" | "Health & Fitness"
  | "Food & Cooking" | "Travel & Adventure" | "Home & Interior Design"
  | "Technology & Gaming" | "Parenting & Family" | "Finance & Business"
  | "Art & Creativity" | "Sustainability & Eco" | "Entertainment & Pop Culture"
  | "Sports & Outdoors" | "Pets & Animals" | "Education & Self-Development";

type AestheticStyle =
  | "Minimalist & Clean" | "Vibrant & Colourful" | "Dark & Moody"
  | "Natural & Earthy" | "Luxury & High-End" | "Casual & Authentic"
  | "Professional & Corporate" | "Artistic & Creative"
  | "Playful & Fun" | "Vintage & Retro";

type AudienceType =
  | "Gen Z (18-24)" | "Millennials (25-34)" | "Parents (30-45)"
  | "Professionals (25-45)" | "Seniors (50+)" | "Broad / Mixed";

type ContentTone =
  | "Inspirational" | "Educational" | "Humorous" | "Aspirational"
  | "Authentic & Raw" | "Promotional" | "Community-Focused";

interface BusinessProfile {
  primary_category: ContentCategory;
  aesthetic: AestheticStyle;
  likely_audience: AudienceType;
  tone: ContentTone;
  secondary_category?: ContentCategory;
}

interface InfluencerRecord {
  instagram: {
    username: string;
    name: string;
    biography: string;
    followers_count: number;
    profile_picture_url?: string;
  };
  reach: {
    tier: string;
    engagement_rate_pct: number;
    engagement_quality: "High" | "Average" | "Below Average";
    follower_count: number;
  };
  brand: {
    primary_category: string | null;
    aesthetic: string | null;
    likely_audience: string | null;
    tone: string | null;
    top_signals: string[];
    posts_analyzed: number;
    avg_confidence: number;
  };
}

interface MatchResult {
  influencer_username: string;
  fit_score: number;
  brand_score: number;
  engagement_quality: string;
  tier: string;
  followers: number;
  engagement_rate: number;
  top_signals: string[];
  record: InfluencerRecord;
}

interface DealTerms {
  principalUSDC: number;
  returnAmountUSDC: number;
  lockDays: number;
  acceptanceDays: number;
}

type TxStep = "idle" | "approving" | "approved" | "funding" | "funded" | "error";

// ─── Mock data (replace with real API calls) ──────────────────────────────────

const MOCK_MATCHES: MatchResult[] = [
  {
    influencer_username: "ava.wellness",
    fit_score: 91,
    brand_score: 95,
    engagement_quality: "High",
    tier: "Micro (10K-100K)",
    followers: 47200,
    engagement_rate: 6.2,
    top_signals: ["outdoor natural settings", "earthy neutral palette", "sustainable brands", "morning routines"],
    record: {
      instagram: { username: "ava.wellness", name: "Ava Chen", biography: "Sustainable wellness | Clean living | Planet-first 🌿", followers_count: 47200 },
      reach: { tier: "Micro (10K-100K)", engagement_rate_pct: 6.2, engagement_quality: "High", follower_count: 47200 },
      brand: { primary_category: "Health & Fitness", aesthetic: "Natural & Earthy", likely_audience: "Millennials (25-34)", tone: "Inspirational", top_signals: ["outdoor natural settings", "earthy neutral palette", "sustainable brands", "morning routines"], posts_analyzed: 12, avg_confidence: 0.88 },
    },
  },
  {
    influencer_username: "movewithmarco",
    fit_score: 84,
    brand_score: 88,
    engagement_quality: "High",
    tier: "Micro (10K-100K)",
    followers: 83100,
    engagement_rate: 4.8,
    top_signals: ["gym training content", "clean lighting", "progress documentation", "motivational captions"],
    record: {
      instagram: { username: "movewithmarco", name: "Marco Rivera", biography: "Certified PT | Evidence-based training | Building strength from scratch 💪", followers_count: 83100 },
      reach: { tier: "Micro (10K-100K)", engagement_rate_pct: 4.8, engagement_quality: "High", follower_count: 83100 },
      brand: { primary_category: "Health & Fitness", aesthetic: "Professional & Corporate", likely_audience: "Millennials (25-34)", tone: "Educational", top_signals: ["gym training content", "clean lighting", "progress documentation", "motivational captions"], posts_analyzed: 12, avg_confidence: 0.84 },
    },
  },
  {
    influencer_username: "lunaforest",
    fit_score: 76,
    brand_score: 80,
    engagement_quality: "Average",
    tier: "Nano (< 10K)",
    followers: 9400,
    engagement_rate: 3.1,
    top_signals: ["forest hiking", "plant-based recipes", "zero-waste lifestyle", "muted greens palette"],
    record: {
      instagram: { username: "lunaforest", name: "Luna Park", biography: "Zero-waste living | Hiking | Plant-based 🌱", followers_count: 9400 },
      reach: { tier: "Nano (< 10K)", engagement_rate_pct: 3.1, engagement_quality: "Average", follower_count: 9400 },
      brand: { primary_category: "Sustainability & Eco", aesthetic: "Natural & Earthy", likely_audience: "Gen Z (18-24)", tone: "Authentic & Raw", top_signals: ["forest hiking", "plant-based recipes", "zero-waste lifestyle", "muted greens palette"], posts_analyzed: 10, avg_confidence: 0.79 },
    },
  },
  {
    influencer_username: "dr.fitscience",
    fit_score: 72,
    brand_score: 75,
    engagement_quality: "Average",
    tier: "Mid-tier (100K-500K)",
    followers: 142000,
    engagement_rate: 2.4,
    top_signals: ["research citations", "whiteboard explainers", "studio lighting", "evidence-based approach"],
    record: {
      instagram: { username: "dr.fitscience", name: "Dr. Sarah Kim", biography: "Exercise physiology PhD | Debunking fitness myths | Science > hype", followers_count: 142000 },
      reach: { tier: "Mid-tier (100K-500K)", engagement_rate_pct: 2.4, engagement_quality: "Average", follower_count: 142000 },
      brand: { primary_category: "Education & Self-Development", aesthetic: "Professional & Corporate", likely_audience: "Professionals (25-45)", tone: "Educational", top_signals: ["research citations", "whiteboard explainers", "studio lighting", "evidence-based approach"], posts_analyzed: 12, avg_confidence: 0.82 },
    },
  },
  {
    influencer_username: "camper.kai",
    fit_score: 61,
    brand_score: 65,
    engagement_quality: "Average",
    tier: "Nano (< 10K)",
    followers: 6800,
    engagement_rate: 2.9,
    top_signals: ["van life", "remote camping", "outdoor cooking", "golden hour photography"],
    record: {
      instagram: { username: "camper.kai", name: "Kai Sato", biography: "Van life + backcountry adventures | PNW based 🏕️", followers_count: 6800 },
      reach: { tier: "Nano (< 10K)", engagement_rate_pct: 2.9, engagement_quality: "Average", follower_count: 6800 },
      brand: { primary_category: "Travel & Adventure", aesthetic: "Casual & Authentic", likely_audience: "Gen Z (18-24)", tone: "Authentic & Raw", top_signals: ["van life", "remote camping", "outdoor cooking", "golden hour photography"], posts_analyzed: 11, avg_confidence: 0.74 },
    },
  },
  {
    influencer_username: "styleby.nora",
    fit_score: 44,
    brand_score: 46,
    engagement_quality: "Below Average",
    tier: "Micro (10K-100K)",
    followers: 31500,
    engagement_rate: 1.2,
    top_signals: ["luxury fashion", "neutral palette", "brand collaborations", "studio editorial shots"],
    record: {
      instagram: { username: "styleby.nora", name: "Nora Blanc", biography: "Editorial fashion | Luxury lifestyle | Paris ↔ NYC", followers_count: 31500 },
      reach: { tier: "Micro (10K-100K)", engagement_rate_pct: 1.2, engagement_quality: "Below Average", follower_count: 31500 },
      brand: { primary_category: "Fashion & Style", aesthetic: "Luxury & High-End", likely_audience: "Millennials (25-34)", tone: "Aspirational", top_signals: ["luxury fashion", "neutral palette", "brand collaborations", "studio editorial shots"], posts_analyzed: 12, avg_confidence: 0.86 },
    },
  },
];

const CATEGORIES: ContentCategory[] = [
  "Fashion & Style","Beauty & Skincare","Health & Fitness","Food & Cooking",
  "Travel & Adventure","Home & Interior Design","Technology & Gaming",
  "Parenting & Family","Finance & Business","Art & Creativity",
  "Sustainability & Eco","Entertainment & Pop Culture","Sports & Outdoors",
  "Pets & Animals","Education & Self-Development",
];

const AESTHETICS: AestheticStyle[] = [
  "Minimalist & Clean","Vibrant & Colourful","Dark & Moody","Natural & Earthy",
  "Luxury & High-End","Casual & Authentic","Professional & Corporate",
  "Artistic & Creative","Playful & Fun","Vintage & Retro",
];

const AUDIENCES: AudienceType[] = [
  "Gen Z (18-24)","Millennials (25-34)","Parents (30-45)",
  "Professionals (25-45)","Seniors (50+)","Broad / Mixed",
];

const TONES: ContentTone[] = [
  "Inspirational","Educational","Humorous","Aspirational",
  "Authentic & Raw","Promotional","Community-Focused",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function scoreColor(score: number): string {
  if (score >= 80) return "#4ade80";
  if (score >= 60) return "#facc15";
  return "#f87171";
}

function engagementBadgeColor(q: string): string {
  if (q === "High") return "#4ade80";
  if (q === "Average") return "#facc15";
  return "#f87171";
}

// ─── Wallet Hook ──────────────────────────────────────────────────────────────

function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (typeof window.ethereum === "undefined") {
      setError("MetaMask not detected. Please install MetaMask to fund deals.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const _provider = new ethers.BrowserProvider(window.ethereum);
      await _provider.send("eth_requestAccounts", []);
      const signer = await _provider.getSigner();
      const _address = await signer.getAddress();
      setProvider(_provider);
      setAddress(_address);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }, []);

  return { address, provider, connecting, error, connect };
}

// ─── Components ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
      <svg width={72} height={72} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={36} cy={36} r={r} fill="none" stroke="#1A2240" strokeWidth={5} />
        <circle
          cx={36} cy={36} r={r} fill="none"
          stroke={scoreColor(score)} strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: scoreColor(score), lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ fontSize: 9, color: "#6B7FA3", letterSpacing: "0.05em" }}>fit</span>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 4, background: "#1A2240",
      border: "1px solid #2A3560", fontSize: 11, color: "#8BA3D4",
    }}>
      {children}
    </span>
  );
}

function Select<T extends string>({
  label, value, options, onChange,
}: {
  label: string; value: T; options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, color: "#6B7FA3", fontWeight: 500 }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{
          background: "#1A2240", border: "1px solid #2A3560", borderRadius: 8,
          color: "#F0F4FF", padding: "10px 12px", fontSize: 14,
          appearance: "none", cursor: "pointer", outline: "none",
        }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

function NumberInput({
  label, value, onChange, min, hint,
}: {
  label: string; value: number; onChange: (v: number) => void; min?: number; hint?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, color: "#6B7FA3", fontWeight: 500 }}>{label}</label>
      <input
        type="number" min={min ?? 0} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: "#1A2240", border: "1px solid #2A3560", borderRadius: 8,
          color: "#F0F4FF", padding: "10px 12px", fontSize: 14, outline: "none",
        }}
      />
      {hint && <span style={{ fontSize: 11, color: "#4F6BFF" }}>{hint}</span>}
    </div>
  );
}

// ─── Page: Business Profile Setup ────────────────────────────────────────────

function ProfilePage({
  profile, onSave,
}: {
  profile: BusinessProfile | null;
  onSave: (p: BusinessProfile) => void;
}) {
  const [form, setForm] = useState<BusinessProfile>(
    profile ?? {
      primary_category: "Health & Fitness",
      aesthetic: "Natural & Earthy",
      likely_audience: "Millennials (25-34)",
      tone: "Inspirational",
      secondary_category: "Sustainability & Eco",
    }
  );

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: "#F0F4FF", margin: 0, lineHeight: 1.1 }}>
          Your brand profile
        </h1>
        <p style={{ color: "#6B7FA3", marginTop: 12, lineHeight: 1.6 }}>
          Define your brand identity. We use this to rank creators by how closely
          their content matches what you represent.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <Select label="Primary category" value={form.primary_category} options={CATEGORIES}
          onChange={(v) => setForm((f) => ({ ...f, primary_category: v }))} />
        <Select label="Secondary category (optional)" value={form.secondary_category ?? CATEGORIES[0]}
          options={CATEGORIES}
          onChange={(v) => setForm((f) => ({ ...f, secondary_category: v }))} />
        <Select label="Visual aesthetic" value={form.aesthetic} options={AESTHETICS}
          onChange={(v) => setForm((f) => ({ ...f, aesthetic: v }))} />
        <Select label="Target audience" value={form.likely_audience} options={AUDIENCES}
          onChange={(v) => setForm((f) => ({ ...f, likely_audience: v }))} />
        <Select label="Brand tone" value={form.tone} options={TONES}
          onChange={(v) => setForm((f) => ({ ...f, tone: v }))} />
      </div>

      <div style={{
        background: "#1A2240", border: "1px solid #2A3560", borderRadius: 12,
        padding: 20, marginBottom: 32,
      }}>
        <p style={{ fontSize: 13, color: "#6B7FA3", margin: 0 }}>Profile preview</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <Tag>{form.primary_category}</Tag>
          {form.secondary_category && <Tag>{form.secondary_category}</Tag>}
          <Tag>{form.aesthetic}</Tag>
          <Tag>{form.likely_audience}</Tag>
          <Tag>{form.tone}</Tag>
        </div>
      </div>

      <button
        onClick={() => onSave(form)}
        style={{
          background: "#4F6BFF", color: "#F0F4FF", border: "none",
          borderRadius: 10, padding: "14px 32px", fontSize: 15, fontWeight: 600,
          cursor: "pointer", letterSpacing: "0.01em",
        }}
      >
        Find matching creators
      </button>
    </div>
  );
}

// ─── Creator Card ─────────────────────────────────────────────────────────────

function CreatorCard({
  match, onSelect,
}: {
  match: MatchResult; onSelect: (m: MatchResult) => void;
}) {
  const { record } = match;

  return (
    <div
      onClick={() => onSelect(match)}
      style={{
        background: "#1A2240", border: "1px solid #2A3560", borderRadius: 14,
        padding: 24, cursor: "pointer", transition: "border-color 0.15s",
        display: "flex", flexDirection: "column", gap: 16,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#4F6BFF")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2A3560")}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        {/* Avatar placeholder */}
        <div style={{
          width: 48, height: 48, borderRadius: "50%", background: "#2A3560",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, flexShrink: 0,
        }}>
          {record.instagram.name[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17, color: "#F0F4FF" }}>
            {record.instagram.name}
          </div>
          <div style={{ fontSize: 13, color: "#6B7FA3" }}>@{record.instagram.username}</div>
        </div>
        <ScoreRing score={match.fit_score} />
      </div>

      {/* Bio */}
      <p style={{
        fontSize: 13, color: "#8BA3D4", margin: 0,
        lineHeight: 1.5, overflow: "hidden", display: "-webkit-box",
        WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
      }}>
        {record.instagram.biography}
      </p>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 20 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: "#F0F4FF" }}>
            {formatFollowers(match.followers)}
          </div>
          <div style={{ fontSize: 11, color: "#6B7FA3" }}>followers</div>
        </div>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: "#F0F4FF" }}>
            {match.engagement_rate}%
          </div>
          <div style={{ fontSize: 11, color: "#6B7FA3" }}>engagement</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
            color: "#0A0F1E",
            background: engagementBadgeColor(match.engagement_quality),
          }}>
            {match.engagement_quality}
          </span>
        </div>
      </div>

      {/* Signals */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {match.top_signals.slice(0, 3).map((s) => (
          <Tag key={s}>{s}</Tag>
        ))}
      </div>

      {/* Tier */}
      <div style={{ fontSize: 12, color: "#4F6BFF", fontWeight: 500 }}>
        {match.tier}
      </div>
    </div>
  );
}

// ─── Page: Browse Creators ────────────────────────────────────────────────────

function BrowsePage({
  matches, onSelect,
}: {
  matches: MatchResult[]; onSelect: (m: MatchResult) => void;
}) {
  const [minScore, setMinScore] = useState(0);
  const [filterTier, setFilterTier] = useState("All");

  const tiers = ["All", "Nano (< 10K)", "Micro (10K-100K)", "Mid-tier (100K-500K)", "Macro (500K-1M)"];

  const filtered = matches
    .filter((m) => m.fit_score >= minScore)
    .filter((m) => filterTier === "All" || m.tier === filterTier)
    .sort((a, b) => b.fit_score - a.fit_score);

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: "#F0F4FF", margin: 0 }}>
          {filtered.length} matched creators
        </h1>
        <p style={{ color: "#6B7FA3", marginTop: 8 }}>
          Ranked by brand fit against your profile. Click a creator to initiate a deal.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 16, marginBottom: 32, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 13, color: "#6B7FA3" }}>Min score</label>
          <input
            type="range" min={0} max={100} value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            style={{ accentColor: "#4F6BFF" }}
          />
          <span style={{ fontSize: 13, color: "#F0F4FF", minWidth: 28 }}>{minScore}</span>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {tiers.map((t) => (
            <button
              key={t}
              onClick={() => setFilterTier(t)}
              style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                border: "1px solid",
                borderColor: filterTier === t ? "#4F6BFF" : "#2A3560",
                background: filterTier === t ? "#4F6BFF22" : "transparent",
                color: filterTier === t ? "#4F6BFF" : "#6B7FA3",
                transition: "all 0.15s",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "80px 0", color: "#6B7FA3",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
          <div style={{ fontSize: 16 }}>No creators match these filters.</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>Try lowering the minimum score or removing the tier filter.</div>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 20,
        }}>
          {filtered.map((m) => (
            <CreatorCard key={m.influencer_username} match={m} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Transaction Stepper ──────────────────────────────────────────────────────

function TxStepper({ step }: { step: TxStep }) {
  const steps: { key: TxStep | "approved"; label: string }[] = [
    { key: "approving", label: "Approve USDC" },
    { key: "approved", label: "Approval confirmed" },
    { key: "funding", label: "Fund contract" },
    { key: "funded", label: "Deal live" },
  ];

  const stepIndex = { idle: -1, approving: 0, approved: 1, funding: 2, funded: 3, error: -1 };
  const current = stepIndex[step];

  return (
    <div style={{ display: "flex", gap: 0, alignItems: "center" }}>
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              border: `2px solid ${i <= current ? "#4F6BFF" : "#2A3560"}`,
              background: i < current ? "#4F6BFF" : i === current ? "#4F6BFF22" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, color: i <= current ? "#F0F4FF" : "#6B7FA3",
              transition: "all 0.3s",
            }}>
              {i < current ? "✓" : i + 1}
            </div>
            <span style={{
              fontSize: 10, color: i <= current ? "#F0F4FF" : "#6B7FA3",
              maxWidth: 70, textAlign: "center", lineHeight: 1.3,
            }}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{
              flex: 1, height: 2, background: i < current ? "#4F6BFF" : "#2A3560",
              margin: "0 8px", marginBottom: 20, transition: "background 0.3s",
            }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Page: Deal Initiation ────────────────────────────────────────────────────

function DealPage({
  match, wallet, onBack,
}: {
  match: MatchResult;
  wallet: ReturnType<typeof useWallet>;
  onBack: () => void;
}) {
  const [terms, setTerms] = useState<DealTerms>({
    principalUSDC: 5000,
    returnAmountUSDC: 5500,
    lockDays: 180,
    acceptanceDays: 7,
  });

  const [txStep, setTxStep] = useState<TxStep>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const returnRate = terms.principalUSDC > 0
    ? (((terms.returnAmountUSDC - terms.principalUSDC) / terms.principalUSDC) * 100).toFixed(1)
    : "0";

  const valid = terms.returnAmountUSDC > terms.principalUSDC
    && terms.principalUSDC > 0
    && terms.lockDays > 0;

  // Simulate the two-step USDC approve → fund flow
  async function handleFund() {
    if (!wallet.address) { await wallet.connect(); return; }
    if (!valid) return;

    setTxError(null);

    try {
      // ── Step 1: Approve USDC ─────────────────────────────────────────────
      // In production:
      //   const signer = await wallet.provider!.getSigner();
      //   const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
      //   const approveTx = await usdc.approve(contractAddress, parseUnits(principal, 6));
      //   await approveTx.wait();
      setTxStep("approving");
      await new Promise<void>((r) => setTimeout(r, 2000)); // simulate approval tx
      setTxStep("approved");

      // ── Step 2: Call fund() on the deployed contract ─────────────────────
      // In production:
      //   const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);
      //   const fundTx = await contract.fund();
      //   await fundTx.wait();
      //   setTxHash(fundTx.hash);
      await new Promise<void>((r) => setTimeout(r, 1000));
      setTxStep("funding");
      await new Promise<void>((r) => setTimeout(r, 2500)); // simulate fund tx
      setTxHash("0xabc123def456...simulated_tx_hash");
      setTxStep("funded");

    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Transaction failed");
      setTxStep("error");
    }
  }

  if (txStep === "funded") {
    return (
      <div style={{ maxWidth: 560 }}>
        <div style={{
          background: "#0D2A1A", border: "1px solid #4ade80", borderRadius: 16,
          padding: 32, textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", color: "#4ade80", margin: "0 0 12px" }}>
            Deal funded
          </h2>
          <p style={{ color: "#8BA3D4", lineHeight: 1.6, margin: "0 0 24px" }}>
            ${terms.principalUSDC.toLocaleString()} USDC is now in escrow.
            @{match.influencer_username} has {terms.acceptanceDays} days to accept.
            If they don't, your funds return automatically.
          </p>
          {txHash && (
            <a
              href={`https://amoy.polygonscan.com/tx/${txHash}`}
              target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: "#4F6BFF" }}
            >
              View on Polygonscan →
            </a>
          )}
        </div>
        <button
          onClick={onBack}
          style={{
            marginTop: 24, background: "transparent", border: "1px solid #2A3560",
            color: "#6B7FA3", borderRadius: 10, padding: "12px 24px",
            fontSize: 14, cursor: "pointer",
          }}
        >
          Browse more creators
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <button
        onClick={onBack}
        style={{
          background: "none", border: "none", color: "#6B7FA3",
          fontSize: 14, cursor: "pointer", padding: 0, marginBottom: 32,
        }}
      >
        ← Back to results
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        {/* Left: creator summary */}
        <div>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: "#F0F4FF", margin: "0 0 8px" }}>
            {match.record.instagram.name}
          </h2>
          <div style={{ color: "#6B7FA3", fontSize: 14, marginBottom: 20 }}>
            @{match.influencer_username}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            <ScoreRing score={match.fit_score} />
            <div>
              <div style={{ fontSize: 13, color: "#F0F4FF", fontWeight: 500 }}>Brand fit</div>
              <div style={{ fontSize: 12, color: "#6B7FA3" }}>
                {match.record.brand.primary_category} · {match.record.brand.aesthetic}
              </div>
            </div>
          </div>

          <div style={{
            background: "#1A2240", border: "1px solid #2A3560", borderRadius: 12, padding: 20,
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20,
          }}>
            <div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: "#F0F4FF" }}>
                {formatFollowers(match.followers)}
              </div>
              <div style={{ fontSize: 11, color: "#6B7FA3" }}>followers</div>
            </div>
            <div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: "#F0F4FF" }}>
                {match.engagement_rate}%
              </div>
              <div style={{ fontSize: 11, color: "#6B7FA3" }}>engagement</div>
            </div>
          </div>

          <p style={{ fontSize: 13, color: "#8BA3D4", lineHeight: 1.6, margin: 0 }}>
            {match.record.instagram.biography}
          </p>

          <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {match.top_signals.map((s) => <Tag key={s}>{s}</Tag>)}
          </div>
        </div>

        {/* Right: deal terms */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <h3 style={{ color: "#F0F4FF", margin: 0, fontSize: 16 }}>Investment terms</h3>

          <NumberInput
            label="You invest (USDC)"
            value={terms.principalUSDC}
            onChange={(v) => setTerms((t) => ({ ...t, principalUSDC: v }))}
            min={100}
          />
          <NumberInput
            label="Creator repays (USDC)"
            value={terms.returnAmountUSDC}
            onChange={(v) => setTerms((t) => ({ ...t, returnAmountUSDC: v }))}
            min={terms.principalUSDC + 1}
            hint={`${returnRate}% return on investment`}
          />
          <NumberInput
            label="Repayment period (days)"
            value={terms.lockDays}
            onChange={(v) => setTerms((t) => ({ ...t, lockDays: v }))}
            min={30}
          />
          <NumberInput
            label="Acceptance window (days)"
            value={terms.acceptanceDays}
            onChange={(v) => setTerms((t) => ({ ...t, acceptanceDays: v }))}
            min={1}
            hint="Creator must accept within this window or funds auto-return"
          />

          {/* Summary card */}
          <div style={{
            background: "#1A2240", border: "1px solid #2A3560", borderRadius: 12, padding: 16,
            fontSize: 13, color: "#8BA3D4", lineHeight: 1.8,
          }}>
            <div>
              Invest <strong style={{ color: "#F0F4FF" }}>${terms.principalUSDC.toLocaleString()} USDC</strong>
            </div>
            <div>
              Receive back <strong style={{ color: "#F0F4FF" }}>${terms.returnAmountUSDC.toLocaleString()} USDC</strong>
            </div>
            <div>
              After <strong style={{ color: "#F0F4FF" }}>{terms.lockDays} days</strong>
            </div>
            <div style={{ color: "#4ade80", marginTop: 4 }}>
              +${(terms.returnAmountUSDC - terms.principalUSDC).toLocaleString()} USDC ({returnRate}%)
            </div>
          </div>

          {/* Wallet section */}
          {!wallet.address ? (
            <button
              onClick={wallet.connect}
              disabled={wallet.connecting}
              style={{
                background: "#4F6BFF", color: "#F0F4FF", border: "none",
                borderRadius: 10, padding: "14px", fontSize: 14, fontWeight: 600,
                cursor: wallet.connecting ? "wait" : "pointer",
                opacity: wallet.connecting ? 0.7 : 1,
              }}
            >
              {wallet.connecting ? "Connecting..." : "Connect wallet to fund"}
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{
                padding: "10px 14px", borderRadius: 8,
                background: "#0D1B38", border: "1px solid #2A3560",
                fontSize: 12, color: "#6B7FA3",
              }}>
                <span style={{ color: "#4ade80" }}>●</span>
                {" "}{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
              </div>

              {txStep !== "idle" && txStep !== "error" && (
                <TxStepper step={txStep} />
              )}

              {txError && (
                <div style={{
                  padding: 12, borderRadius: 8,
                  background: "#2A0D0D", border: "1px solid #f87171",
                  fontSize: 12, color: "#f87171",
                }}>
                  {txError}
                </div>
              )}

              <button
                onClick={handleFund}
                disabled={!valid || (txStep !== "idle" && txStep !== "error")}
                style={{
                  background: valid ? "#4F6BFF" : "#1A2240",
                  color: valid ? "#F0F4FF" : "#6B7FA3",
                  border: "none", borderRadius: 10, padding: "14px",
                  fontSize: 14, fontWeight: 600,
                  cursor: valid && txStep === "idle" ? "pointer" : "not-allowed",
                  transition: "background 0.15s",
                }}
              >
                {txStep === "approving" && "Waiting for approval..."}
                {txStep === "approved" && "Approval confirmed"}
                {txStep === "funding" && "Funding contract..."}
                {(txStep === "idle" || txStep === "error") && `Fund $${terms.principalUSDC.toLocaleString()} USDC`}
              </button>

              <p style={{ fontSize: 11, color: "#6B7FA3", margin: 0, lineHeight: 1.5 }}>
                Two transactions required: (1) approve USDC spend, (2) fund the contract.
                Funds are held in escrow and return automatically if the creator doesn't accept.
              </p>
            </div>
          )}

          {wallet.error && (
            <div style={{ fontSize: 12, color: "#f87171" }}>{wallet.error}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav({
  page, hasProfile, onNav, walletAddress, onConnect,
}: {
  page: Page; hasProfile: boolean;
  onNav: (p: Page) => void;
  walletAddress: string | null;
  onConnect: () => void;
}) {
  return (
    <nav style={{
      display: "flex", alignItems: "center", padding: "0 40px",
      height: 60, borderBottom: "1px solid #1A2240",
      background: "#0A0F1E", position: "sticky", top: 0, zIndex: 10,
    }}>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: "#F0F4FF", marginRight: 40 }}>
        InfluenceVest
      </div>

      <div style={{ display: "flex", gap: 4, flex: 1 }}>
        {(["profile", "browse"] as Page[]).map((p) => (
          <button
            key={p}
            onClick={() => (p === "browse" && !hasProfile ? null : onNav(p))}
            disabled={p === "browse" && !hasProfile}
            style={{
              background: page === p ? "#1A2240" : "none",
              border: "none",
              color: page === p ? "#F0F4FF" : "#6B7FA3",
              fontSize: 14, cursor: hasProfile || p === "profile" ? "pointer" : "not-allowed",
              padding: "6px 14px", borderRadius: 6,
            }}
          >
            {p === "profile" ? "My brand" : "Browse creators"}
          </button>
        ))}
      </div>

      <button
        onClick={onConnect}
        style={{
          background: walletAddress ? "#1A2240" : "#4F6BFF",
          border: "1px solid",
          borderColor: walletAddress ? "#2A3560" : "#4F6BFF",
          color: "#F0F4FF", borderRadius: 8, padding: "7px 16px",
          fontSize: 13, cursor: "pointer",
        }}
      >
        {walletAddress
          ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
          : "Connect wallet"}
      </button>
    </nav>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

declare global {
  interface Window { ethereum?: ethers.Eip1193Provider; }
}

export default function App() {
  const [page, setPage] = useState<Page>("profile");
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<MatchResult | null>(null);
  const wallet = useWallet();

  function handleSaveProfile(p: BusinessProfile) {
    setProfile(p);
    setPage("browse");
  }

  function handleSelectMatch(m: MatchResult) {
    setSelectedMatch(m);
    setPage("deal");
  }

  function handleBack() {
    setSelectedMatch(null);
    setPage("browse");
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0A0F1E; color: #F0F4FF; font-family: 'Inter', sans-serif; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0A0F1E; }
        ::-webkit-scrollbar-thumb { background: #2A3560; border-radius: 3px; }
        select option { background: #1A2240; }
      `}</style>

      <Nav
        page={page} hasProfile={profile !== null}
        onNav={(p) => { if (p !== "deal") setSelectedMatch(null); setPage(p); }}
        walletAddress={wallet.address}
        onConnect={wallet.connect}
      />

      <main style={{ padding: "48px 40px", minHeight: "calc(100vh - 60px)" }}>
        {page === "profile" && (
          <ProfilePage profile={profile} onSave={handleSaveProfile} />
        )}
        {page === "browse" && profile && (
          <BrowsePage matches={MOCK_MATCHES} onSelect={handleSelectMatch} />
        )}
        {page === "deal" && selectedMatch && (
          <DealPage match={selectedMatch} wallet={wallet} onBack={handleBack} />
        )}
      </main>
    </>
  );
}
