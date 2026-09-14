// server.ts — OAuth service
import "dotenv/config";
import express, { Request, Response } from "express";
import { buildAuthorizationUrl, handleCallback, refreshToken } from "./oauthHandler";
import { getToken, getExpiringTokens, isConnected, deleteToken } from "./tokenStore";
import { ConnectionStatus } from "./types";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Demo UI ───────────────────────────────────────────────────────────────────
app.get("/", (_req: Request, res: Response) => {
  const demoInfluencerId = "influencer_001";
  const connected = isConnected(demoInfluencerId);

  res.send(`<!DOCTYPE html><html><head><title>Connect Instagram</title>
  <style>
    body{font-family:sans-serif;max-width:480px;margin:80px auto;padding:0 20px}
    .btn{display:inline-block;padding:12px 24px;border-radius:8px;font-size:16px;
         cursor:pointer;text-decoration:none;border:none}
    .btn-ig{background:#E1306C;color:white}
    .btn-dc{background:#eee;color:#333}
    .status{padding:12px;border-radius:8px;margin:16px 0}
    .ok{background:#d4edda;color:#155724}
    .no{background:#f8d7da;color:#721c24}
  </style></head><body>
  <h2>Instagram Connection</h2>
  <p>Influencer ID: <code>${demoInfluencerId}</code></p>
  ${connected
    ? `<div class="status ok">✅ Connected</div>
       <a href="/auth/instagram/status?influencerId=${demoInfluencerId}">View details</a><br><br>
       <form method="POST" action="/auth/instagram/disconnect">
         <input type="hidden" name="influencerId" value="${demoInfluencerId}">
         <button class="btn btn-dc" type="submit">Disconnect</button>
       </form>`
    : `<div class="status no">❌ Not connected</div>
       <a class="btn btn-ig" href="/auth/instagram/connect?influencerId=${demoInfluencerId}">
         Connect Instagram
       </a>`}
  </body></html>`);
});

// ── Connect ───────────────────────────────────────────────────────────────────
app.get("/auth/instagram/connect", (req: Request, res: Response) => {
  const influencerId = req.query.influencerId as string | undefined;
  if (!influencerId) return res.status(400).json({ error: "influencerId required" });
  if (isConnected(influencerId)) return res.redirect("/?already_connected=true");
  const { url } = buildAuthorizationUrl(influencerId);
  return res.redirect(url);
});

// ── Callback ──────────────────────────────────────────────────────────────────
app.get("/auth/instagram/callback", async (req: Request, res: Response) => {
  const { code, state, error, error_reason, error_description } = req.query as Record<string, string>;

  if (error) {
    console.warn(`OAuth denied: ${error_reason} — ${error_description}`);
    return res.redirect("/?error=denied");
  }

  if (!code || !state) return res.status(400).send("Missing code or state");

  try {
    const influencerId = await handleCallback(code, state);
    return res.redirect(`/?connected=true&influencerId=${influencerId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Callback error:", message);
    return res.status(500).send(`OAuth failed: ${message}`);
  }
});

// ── Status ────────────────────────────────────────────────────────────────────
app.get("/auth/instagram/status", (req: Request, res: Response<ConnectionStatus>) => {
  const influencerId = req.query.influencerId as string | undefined;
  if (!influencerId) return res.status(400).json({ connected: false, influencerId: "" });

  const record = getToken(influencerId);
  if (!record) return res.json({ connected: false, influencerId });

  return res.json({
    connected: true,
    influencerId,
    username: record.username,
    instagramUserId: record.instagramUserId,
    connectedAt: record.connectedAt,
    tokenExpiresAt: record.expiresAt,
    daysUntilExpiry: Math.floor(
      (new Date(record.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    ),
  });
});

// ── Disconnect ────────────────────────────────────────────────────────────────
app.post("/auth/instagram/disconnect", (req: Request, res: Response) => {
  const influencerId = (req.body.influencerId ?? req.query.influencerId) as string | undefined;
  if (!influencerId) return res.status(400).json({ error: "influencerId required" });

  deleteToken(influencerId);

  if (req.headers["content-type"]?.includes("application/x-www-form-urlencoded")) {
    return res.redirect("/");
  }
  return res.json({ success: true });
});

// ── Token refresh scheduler ───────────────────────────────────────────────────
async function runTokenRefreshJob(): Promise<void> {
  const expiring = getExpiringTokens(10);
  if (expiring.length === 0) return;

  console.log(`Refreshing ${expiring.length} expiring token(s)...`);
  for (const influencerId of expiring) {
    const record = getToken(influencerId);
    if (!record) continue;
    try {
      await refreshToken(influencerId, record.accessToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`Failed to refresh token for ${influencerId}: ${message}`);
    }
  }
}

setInterval(() => { void runTokenRefreshJob(); }, 24 * 60 * 60 * 1000);
void runTokenRefreshJob();

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => console.log(`OAuth service running at http://localhost:${PORT}`));

export default app;
