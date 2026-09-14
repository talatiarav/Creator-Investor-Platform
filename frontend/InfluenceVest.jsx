import { useState, useCallback } from "react";

// ─── Types are inlined for the artifact ───────────────────────────────────────

const CATEGORIES = [
  "Fashion & Style","Beauty & Skincare","Health & Fitness","Food & Cooking",
  "Travel & Adventure","Home & Interior Design","Technology & Gaming",
  "Parenting & Family","Finance & Business","Art & Creativity",
  "Sustainability & Eco","Entertainment & Pop Culture","Sports & Outdoors",
  "Pets & Animals","Education & Self-Development",
];

const AESTHETICS = [
  "Minimalist & Clean","Vibrant & Colourful","Dark & Moody","Natural & Earthy",
  "Luxury & High-End","Casual & Authentic","Professional & Corporate",
  "Artistic & Creative","Playful & Fun","Vintage & Retro",
];

const AUDIENCES = [
  "Gen Z (18-24)","Millennials (25-34)","Parents (30-45)",
  "Professionals (25-45)","Seniors (50+)","Broad / Mixed",
];

const TONES = [
  "Inspirational","Educational","Humorous","Aspirational",
  "Authentic & Raw","Promotional","Community-Focused",
];

const MOCK_MATCHES = [
  {
    influencer_username: "ava.wellness", fit_score: 91, brand_score: 95,
    engagement_quality: "High", tier: "Micro (10K-100K)", followers: 47200, engagement_rate: 6.2,
    top_signals: ["outdoor natural settings", "earthy neutral palette", "sustainable brands", "morning routines"],
    record: {
      instagram: { username: "ava.wellness", name: "Ava Chen", biography: "Sustainable wellness | Clean living | Planet-first 🌿", followers_count: 47200 },
      reach: { tier: "Micro (10K-100K)", engagement_rate_pct: 6.2, engagement_quality: "High", follower_count: 47200 },
      brand: { primary_category: "Health & Fitness", aesthetic: "Natural & Earthy", likely_audience: "Millennials (25-34)", tone: "Inspirational", top_signals: ["outdoor natural settings", "earthy neutral palette", "sustainable brands", "morning routines"], posts_analyzed: 12, avg_confidence: 0.88 },
    },
  },
  {
    influencer_username: "movewithmarco", fit_score: 84, brand_score: 88,
    engagement_quality: "High", tier: "Micro (10K-100K)", followers: 83100, engagement_rate: 4.8,
    top_signals: ["gym training content", "clean lighting", "progress documentation", "motivational captions"],
    record: {
      instagram: { username: "movewithmarco", name: "Marco Rivera", biography: "Certified PT | Evidence-based training | Building strength from scratch 💪", followers_count: 83100 },
      reach: { tier: "Micro (10K-100K)", engagement_rate_pct: 4.8, engagement_quality: "High", follower_count: 83100 },
      brand: { primary_category: "Health & Fitness", aesthetic: "Professional & Corporate", likely_audience: "Millennials (25-34)", tone: "Educational", top_signals: ["gym training content", "clean lighting", "progress documentation", "motivational captions"], posts_analyzed: 12, avg_confidence: 0.84 },
    },
  },
  {
    influencer_username: "lunaforest", fit_score: 76, brand_score: 80,
    engagement_quality: "Average", tier: "Nano (< 10K)", followers: 9400, engagement_rate: 3.1,
    top_signals: ["forest hiking", "plant-based recipes", "zero-waste lifestyle", "muted greens palette"],
    record: {
      instagram: { username: "lunaforest", name: "Luna Park", biography: "Zero-waste living | Hiking | Plant-based 🌱", followers_count: 9400 },
      reach: { tier: "Nano (< 10K)", engagement_rate_pct: 3.1, engagement_quality: "Average", follower_count: 9400 },
      brand: { primary_category: "Sustainability & Eco", aesthetic: "Natural & Earthy", likely_audience: "Gen Z (18-24)", tone: "Authentic & Raw", top_signals: ["forest hiking", "plant-based recipes", "zero-waste lifestyle", "muted greens palette"], posts_analyzed: 10, avg_confidence: 0.79 },
    },
  },
  {
    influencer_username: "dr.fitscience", fit_score: 72, brand_score: 75,
    engagement_quality: "Average", tier: "Mid-tier (100K-500K)", followers: 142000, engagement_rate: 2.4,
    top_signals: ["research citations", "whiteboard explainers", "studio lighting", "evidence-based approach"],
    record: {
      instagram: { username: "dr.fitscience", name: "Dr. Sarah Kim", biography: "Exercise physiology PhD | Debunking fitness myths | Science > hype", followers_count: 142000 },
      reach: { tier: "Mid-tier (100K-500K)", engagement_rate_pct: 2.4, engagement_quality: "Average", follower_count: 142000 },
      brand: { primary_category: "Education & Self-Development", aesthetic: "Professional & Corporate", likely_audience: "Professionals (25-45)", tone: "Educational", top_signals: ["research citations", "whiteboard explainers", "studio lighting", "evidence-based approach"], posts_analyzed: 12, avg_confidence: 0.82 },
    },
  },
  {
    influencer_username: "camper.kai", fit_score: 61, brand_score: 65,
    engagement_quality: "Average", tier: "Nano (< 10K)", followers: 6800, engagement_rate: 2.9,
    top_signals: ["van life", "remote camping", "outdoor cooking", "golden hour photography"],
    record: {
      instagram: { username: "camper.kai", name: "Kai Sato", biography: "Van life + backcountry adventures | PNW based 🏕️", followers_count: 6800 },
      reach: { tier: "Nano (< 10K)", engagement_rate_pct: 2.9, engagement_quality: "Average", follower_count: 6800 },
      brand: { primary_category: "Travel & Adventure", aesthetic: "Casual & Authentic", likely_audience: "Gen Z (18-24)", tone: "Authentic & Raw", top_signals: ["van life", "remote camping", "outdoor cooking", "golden hour photography"], posts_analyzed: 11, avg_confidence: 0.74 },
    },
  },
  {
    influencer_username: "styleby.nora", fit_score: 44, brand_score: 46,
    engagement_quality: "Below Average", tier: "Micro (10K-100K)", followers: 31500, engagement_rate: 1.2,
    top_signals: ["luxury fashion", "neutral palette", "brand collaborations", "studio editorial shots"],
    record: {
      instagram: { username: "styleby.nora", name: "Nora Blanc", biography: "Editorial fashion | Luxury lifestyle | Paris ↔ NYC", followers_count: 31500 },
      reach: { tier: "Micro (10K-100K)", engagement_rate_pct: 1.2, engagement_quality: "Below Average", follower_count: 31500 },
      brand: { primary_category: "Fashion & Style", aesthetic: "Luxury & High-End", likely_audience: "Millennials (25-34)", tone: "Aspirational", top_signals: ["luxury fashion", "neutral palette", "brand collaborations", "studio editorial shots"], posts_analyzed: 12, avg_confidence: 0.86 },
    },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFollowers(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function scoreColor(score) {
  if (score >= 80) return "#4ade80";
  if (score >= 60) return "#facc15";
  return "#f87171";
}

function engagementColor(q) {
  if (q === "High") return "#4ade80";
  if (q === "Average") return "#facc15";
  return "#f87171";
}

// ─── Components ───────────────────────────────────────────────────────────────

function ScoreRing({ score }) {
  const r = 28, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
      <svg width={72} height={72} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={36} cy={36} r={r} fill="none" stroke="#1A2240" strokeWidth={5} />
        <circle cx={36} cy={36} r={r} fill="none" stroke={scoreColor(score)} strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "Georgia, serif", fontSize: 18, color: scoreColor(score), lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 9, color: "#6B7FA3" }}>fit</span>
      </div>
    </div>
  );
}

function Tag({ children }) {
  return (
    <span style={{ padding: "2px 8px", borderRadius: 4, background: "#1A2240", border: "1px solid #2A3560", fontSize: 11, color: "#8BA3D4" }}>
      {children}
    </span>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, color: "#6B7FA3", fontWeight: 500 }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: "#1A2240", border: "1px solid #2A3560", borderRadius: 8, color: "#F0F4FF", padding: "10px 12px", fontSize: 14, cursor: "pointer", outline: "none" }}>
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );
}

function NumberInput({ label, value, onChange, min, hint }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, color: "#6B7FA3", fontWeight: 500 }}>{label}</label>
      <input type="number" min={min ?? 0} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: "#1A2240", border: "1px solid #2A3560", borderRadius: 8, color: "#F0F4FF", padding: "10px 12px", fontSize: 14, outline: "none" }} />
      {hint && <span style={{ fontSize: 11, color: "#4F6BFF" }}>{hint}</span>}
    </div>
  );
}

// ─── Page: Profile Setup ──────────────────────────────────────────────────────

function ProfilePage({ profile, onSave }) {
  const [form, setForm] = useState(profile ?? {
    primary_category: "Health & Fitness",
    aesthetic: "Natural & Earthy",
    likely_audience: "Millennials (25-34)",
    tone: "Inspirational",
    secondary_category: "Sustainability & Eco",
  });

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 36, color: "#F0F4FF", margin: 0, lineHeight: 1.1 }}>
          Your brand profile
        </h1>
        <p style={{ color: "#6B7FA3", marginTop: 12, lineHeight: 1.6 }}>
          Define your brand identity. We use this to rank creators by how closely
          their content matches what you represent.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <SelectField label="Primary category" value={form.primary_category} options={CATEGORIES}
          onChange={(v) => setForm(f => ({ ...f, primary_category: v }))} />
        <SelectField label="Secondary category" value={form.secondary_category ?? CATEGORIES[0]}
          options={CATEGORIES} onChange={(v) => setForm(f => ({ ...f, secondary_category: v }))} />
        <SelectField label="Visual aesthetic" value={form.aesthetic} options={AESTHETICS}
          onChange={(v) => setForm(f => ({ ...f, aesthetic: v }))} />
        <SelectField label="Target audience" value={form.likely_audience} options={AUDIENCES}
          onChange={(v) => setForm(f => ({ ...f, likely_audience: v }))} />
        <SelectField label="Brand tone" value={form.tone} options={TONES}
          onChange={(v) => setForm(f => ({ ...f, tone: v }))} />
      </div>

      <div style={{ background: "#1A2240", border: "1px solid #2A3560", borderRadius: 12, padding: 20, marginBottom: 32 }}>
        <p style={{ fontSize: 13, color: "#6B7FA3", margin: "0 0 12px" }}>Profile preview</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Tag>{form.primary_category}</Tag>
          {form.secondary_category && <Tag>{form.secondary_category}</Tag>}
          <Tag>{form.aesthetic}</Tag>
          <Tag>{form.likely_audience}</Tag>
          <Tag>{form.tone}</Tag>
        </div>
      </div>

      <button onClick={() => onSave(form)}
        style={{ background: "#4F6BFF", color: "#F0F4FF", border: "none", borderRadius: 10, padding: "14px 32px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
        Find matching creators
      </button>
    </div>
  );
}

// ─── Creator Card ─────────────────────────────────────────────────────────────

function CreatorCard({ match, onSelect }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div onClick={() => onSelect(match)}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background: "#1A2240", border: `1px solid ${hovered ? "#4F6BFF" : "#2A3560"}`, borderRadius: 14, padding: 24, cursor: "pointer", transition: "border-color 0.15s", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#2A3560", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
          {match.record.instagram.name[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 17, color: "#F0F4FF" }}>{match.record.instagram.name}</div>
          <div style={{ fontSize: 13, color: "#6B7FA3" }}>@{match.influencer_username}</div>
        </div>
        <ScoreRing score={match.fit_score} />
      </div>

      <p style={{ fontSize: 13, color: "#8BA3D4", margin: 0, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
        {match.record.instagram.biography}
      </p>

      <div style={{ display: "flex", gap: 20 }}>
        <div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#F0F4FF" }}>{formatFollowers(match.followers)}</div>
          <div style={{ fontSize: 11, color: "#6B7FA3" }}>followers</div>
        </div>
        <div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#F0F4FF" }}>{match.engagement_rate}%</div>
          <div style={{ fontSize: 11, color: "#6B7FA3" }}>engagement</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, color: "#0A0F1E", background: engagementColor(match.engagement_quality) }}>
            {match.engagement_quality}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {match.top_signals.slice(0, 3).map(s => <Tag key={s}>{s}</Tag>)}
      </div>
      <div style={{ fontSize: 12, color: "#4F6BFF", fontWeight: 500 }}>{match.tier}</div>
    </div>
  );
}

// ─── Page: Browse ─────────────────────────────────────────────────────────────

function BrowsePage({ matches, onSelect }) {
  const [minScore, setMinScore] = useState(0);
  const [filterTier, setFilterTier] = useState("All");
  const tiers = ["All", "Nano (< 10K)", "Micro (10K-100K)", "Mid-tier (100K-500K)"];

  const filtered = matches
    .filter(m => m.fit_score >= minScore)
    .filter(m => filterTier === "All" || m.tier === filterTier)
    .sort((a, b) => b.fit_score - a.fit_score);

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 36, color: "#F0F4FF", margin: 0 }}>
          {filtered.length} matched creators
        </h1>
        <p style={{ color: "#6B7FA3", marginTop: 8 }}>Ranked by brand fit. Click a creator to initiate a deal.</p>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 32, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 13, color: "#6B7FA3" }}>Min score</label>
          <input type="range" min={0} max={100} value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
            style={{ accentColor: "#4F6BFF" }} />
          <span style={{ fontSize: 13, color: "#F0F4FF", minWidth: 28 }}>{minScore}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {tiers.map(t => (
            <button key={t} onClick={() => setFilterTier(t)}
              style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: "1px solid", borderColor: filterTier === t ? "#4F6BFF" : "#2A3560", background: filterTier === t ? "#4F6BFF22" : "transparent", color: filterTier === t ? "#4F6BFF" : "#6B7FA3", transition: "all 0.15s" }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "#6B7FA3" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
          <div style={{ fontSize: 16 }}>No creators match these filters.</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>Try lowering the minimum score or removing the tier filter.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
          {filtered.map(m => <CreatorCard key={m.influencer_username} match={m} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  );
}

// ─── Tx Stepper ───────────────────────────────────────────────────────────────

function TxStepper({ step }) {
  const steps = [
    { key: "approving", label: "Approve USDC" },
    { key: "approved", label: "Approval confirmed" },
    { key: "funding", label: "Fund contract" },
    { key: "funded", label: "Deal live" },
  ];
  const idx = { idle: -1, approving: 0, approved: 1, funding: 2, funded: 3, error: -1 };
  const current = idx[step];

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {steps.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", border: `2px solid ${i <= current ? "#4F6BFF" : "#2A3560"}`, background: i < current ? "#4F6BFF" : i === current ? "#4F6BFF22" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: i <= current ? "#F0F4FF" : "#6B7FA3", transition: "all 0.3s" }}>
              {i < current ? "✓" : i + 1}
            </div>
            <span style={{ fontSize: 10, color: i <= current ? "#F0F4FF" : "#6B7FA3", maxWidth: 70, textAlign: "center", lineHeight: 1.3 }}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, background: i < current ? "#4F6BFF" : "#2A3560", margin: "0 8px", marginBottom: 20, transition: "background 0.3s" }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Page: Deal ───────────────────────────────────────────────────────────────

function DealPage({ match, walletAddress, onBack }) {
  const [terms, setTerms] = useState({ principalUSDC: 5000, returnAmountUSDC: 5500, lockDays: 180, acceptanceDays: 7 });
  const [txStep, setTxStep] = useState("idle");
  const [txHash, setTxHash] = useState(null);
  const [txError, setTxError] = useState(null);

  const returnRate = terms.principalUSDC > 0
    ? (((terms.returnAmountUSDC - terms.principalUSDC) / terms.principalUSDC) * 100).toFixed(1)
    : "0";
  const valid = terms.returnAmountUSDC > terms.principalUSDC && terms.principalUSDC > 0 && terms.lockDays > 0;

  async function handleFund() {
    if (!valid) return;
    setTxError(null);
    try {
      setTxStep("approving");
      await new Promise(r => setTimeout(r, 2000));
      setTxStep("approved");
      await new Promise(r => setTimeout(r, 800));
      setTxStep("funding");
      await new Promise(r => setTimeout(r, 2500));
      setTxHash("0x4a2f...c891");
      setTxStep("funded");
    } catch (err) {
      setTxError(err.message ?? "Transaction failed");
      setTxStep("error");
    }
  }

  if (txStep === "funded") {
    return (
      <div style={{ maxWidth: 560 }}>
        <div style={{ background: "#0D2A1A", border: "1px solid #4ade80", borderRadius: 16, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontFamily: "Georgia, serif", color: "#4ade80", margin: "0 0 12px", fontSize: 28 }}>Deal funded</h2>
          <p style={{ color: "#8BA3D4", lineHeight: 1.6, margin: "0 0 24px" }}>
            ${terms.principalUSDC.toLocaleString()} USDC is now in escrow on Polygon.
            @{match.influencer_username} has {terms.acceptanceDays} days to accept.
            If they don't, your funds return automatically.
          </p>
          {txHash && (
            <div style={{ fontSize: 12, color: "#4F6BFF" }}>
              Tx: {txHash} · <span style={{ color: "#6B7FA3" }}>amoy.polygonscan.com</span>
            </div>
          )}
        </div>
        <button onClick={onBack}
          style={{ marginTop: 24, background: "transparent", border: "1px solid #2A3560", color: "#6B7FA3", borderRadius: 10, padding: "12px 24px", fontSize: 14, cursor: "pointer" }}>
          Browse more creators
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <button onClick={onBack}
        style={{ background: "none", border: "none", color: "#6B7FA3", fontSize: 14, cursor: "pointer", padding: 0, marginBottom: 32 }}>
        ← Back to results
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
        {/* Creator summary */}
        <div>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: 28, color: "#F0F4FF", margin: "0 0 4px" }}>{match.record.instagram.name}</h2>
          <div style={{ color: "#6B7FA3", fontSize: 14, marginBottom: 20 }}>@{match.influencer_username}</div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            <ScoreRing score={match.fit_score} />
            <div>
              <div style={{ fontSize: 13, color: "#F0F4FF", fontWeight: 500 }}>Brand fit score</div>
              <div style={{ fontSize: 12, color: "#6B7FA3" }}>{match.record.brand.primary_category} · {match.record.brand.aesthetic}</div>
            </div>
          </div>

          <div style={{ background: "#1A2240", border: "1px solid #2A3560", borderRadius: 12, padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 22, color: "#F0F4FF" }}>{formatFollowers(match.followers)}</div>
              <div style={{ fontSize: 11, color: "#6B7FA3" }}>followers</div>
            </div>
            <div>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 22, color: "#F0F4FF" }}>{match.engagement_rate}%</div>
              <div style={{ fontSize: 11, color: "#6B7FA3" }}>engagement rate</div>
            </div>
          </div>

          <p style={{ fontSize: 13, color: "#8BA3D4", lineHeight: 1.6, margin: "0 0 16px" }}>{match.record.instagram.biography}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {match.top_signals.map(s => <Tag key={s}>{s}</Tag>)}
          </div>
        </div>

        {/* Deal terms */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <h3 style={{ color: "#F0F4FF", margin: 0, fontSize: 16 }}>Investment terms</h3>

          <NumberInput label="You invest (USDC)" value={terms.principalUSDC}
            onChange={v => setTerms(t => ({ ...t, principalUSDC: v }))} min={100} />
          <NumberInput label="Creator repays (USDC)" value={terms.returnAmountUSDC}
            onChange={v => setTerms(t => ({ ...t, returnAmountUSDC: v }))}
            min={terms.principalUSDC + 1} hint={`${returnRate}% return on investment`} />
          <NumberInput label="Repayment period (days)" value={terms.lockDays}
            onChange={v => setTerms(t => ({ ...t, lockDays: v }))} min={30} />
          <NumberInput label="Acceptance window (days)" value={terms.acceptanceDays}
            onChange={v => setTerms(t => ({ ...t, acceptanceDays: v }))} min={1}
            hint="Funds auto-return if creator doesn't accept in time" />

          <div style={{ background: "#1A2240", border: "1px solid #2A3560", borderRadius: 12, padding: 16, fontSize: 13, color: "#8BA3D4", lineHeight: 1.8 }}>
            <div>Invest <strong style={{ color: "#F0F4FF" }}>${terms.principalUSDC.toLocaleString()} USDC</strong></div>
            <div>Receive back <strong style={{ color: "#F0F4FF" }}>${terms.returnAmountUSDC.toLocaleString()} USDC</strong></div>
            <div>After <strong style={{ color: "#F0F4FF" }}>{terms.lockDays} days</strong></div>
            <div style={{ color: "#4ade80", marginTop: 4 }}>
              +${(terms.returnAmountUSDC - terms.principalUSDC).toLocaleString()} USDC profit ({returnRate}%)
            </div>
          </div>

          {walletAddress ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "#0D1B38", border: "1px solid #2A3560", fontSize: 12, color: "#6B7FA3" }}>
                <span style={{ color: "#4ade80" }}>●</span> {walletAddress}
              </div>

              {txStep !== "idle" && txStep !== "error" && <TxStepper step={txStep} />}

              {txError && (
                <div style={{ padding: 12, borderRadius: 8, background: "#2A0D0D", border: "1px solid #f87171", fontSize: 12, color: "#f87171" }}>{txError}</div>
              )}

              <button onClick={handleFund}
                disabled={!valid || (txStep !== "idle" && txStep !== "error")}
                style={{ background: valid ? "#4F6BFF" : "#1A2240", color: valid ? "#F0F4FF" : "#6B7FA3", border: "none", borderRadius: 10, padding: "14px", fontSize: 14, fontWeight: 600, cursor: valid && txStep === "idle" ? "pointer" : "not-allowed", transition: "background 0.15s" }}>
                {txStep === "approving" && "Waiting for USDC approval..."}
                {txStep === "approved" && "Approval confirmed ✓"}
                {txStep === "funding" && "Funding contract..."}
                {(txStep === "idle" || txStep === "error") && `Fund $${terms.principalUSDC.toLocaleString()} USDC`}
              </button>

              <p style={{ fontSize: 11, color: "#6B7FA3", margin: 0, lineHeight: 1.5 }}>
                Two wallet confirmations: approve USDC spend, then fund the contract.
                Funds are held in escrow on Polygon and auto-return if creator doesn't accept.
              </p>
            </div>
          ) : (
            <div style={{ padding: 20, borderRadius: 12, background: "#1A2240", border: "1px solid #2A3560", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#6B7FA3", marginBottom: 12 }}>Connect your wallet in the nav to fund this deal</div>
              <div style={{ fontSize: 11, color: "#4F6BFF" }}>MetaMask or WalletConnect supported</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav({ page, hasProfile, onNav, walletAddress, onConnectWallet }) {
  return (
    <nav style={{ display: "flex", alignItems: "center", padding: "0 32px", height: 60, borderBottom: "1px solid #1A2240", background: "#0A0F1E", position: "sticky", top: 0, zIndex: 10 }}>
      <div style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#F0F4FF", marginRight: 32 }}>InfluenceVest</div>
      <div style={{ display: "flex", gap: 4, flex: 1 }}>
        {["profile", "browse"].map(p => (
          <button key={p} onClick={() => (p === "browse" && !hasProfile) ? null : onNav(p)}
            style={{ background: page === p ? "#1A2240" : "none", border: "none", color: page === p ? "#F0F4FF" : "#6B7FA3", fontSize: 14, cursor: hasProfile || p === "profile" ? "pointer" : "not-allowed", padding: "6px 14px", borderRadius: 6 }}>
            {p === "profile" ? "My brand" : "Browse creators"}
          </button>
        ))}
      </div>
      <button onClick={onConnectWallet}
        style={{ background: walletAddress ? "#1A2240" : "#4F6BFF", border: "1px solid", borderColor: walletAddress ? "#2A3560" : "#4F6BFF", color: "#F0F4FF", borderRadius: 8, padding: "7px 16px", fontSize: 13, cursor: "pointer" }}>
        {walletAddress ? `${walletAddress}` : "Connect wallet"}
      </button>
    </nav>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState("profile");
  const [profile, setProfile] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  // Simulate wallet — in production uses ethers.BrowserProvider
  const [walletAddress, setWalletAddress] = useState(null);

  function connectWallet() {
    // Simulated — in production: new ethers.BrowserProvider(window.ethereum)
    setWalletAddress("0x71C7...3F4a");
  }

  function handleSaveProfile(p) {
    setProfile(p);
    setPage("browse");
  }

  function handleSelectMatch(m) {
    setSelectedMatch(m);
    setPage("deal");
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0A0F1E; color: #F0F4FF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        input[type=range] { cursor: pointer; }
        select { appearance: none; }
        select option { background: #1A2240; }
      `}</style>

      <Nav page={page} hasProfile={!!profile}
        onNav={p => { if (p !== "deal") setSelectedMatch(null); setPage(p); }}
        walletAddress={walletAddress} onConnectWallet={connectWallet} />

      <main style={{ padding: "48px 32px", minHeight: "calc(100vh - 60px)", background: "#0A0F1E" }}>
        {page === "profile" && <ProfilePage profile={profile} onSave={handleSaveProfile} />}
        {page === "browse" && profile && <BrowsePage matches={MOCK_MATCHES} onSelect={handleSelectMatch} />}
        {page === "deal" && selectedMatch && (
          <DealPage match={selectedMatch} walletAddress={walletAddress}
            onBack={() => { setSelectedMatch(null); setPage("browse"); }} />
        )}
      </main>
    </>
  );
}
