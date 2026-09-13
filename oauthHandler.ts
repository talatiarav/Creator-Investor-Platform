// oauthHandler.ts
// Meta OAuth 2.0 flow for Instagram — four steps:
//   1. buildAuthorizationUrl  → redirect influencer to Meta
//   2. handleCallback         → exchange code for short-lived token
//   3. exchangeForLongLived   → 60-day token, store encrypted
//   4. refreshToken           → extend before expiry

import axios from "axios";
import crypto from "crypto";
import { saveToken, updateToken } from "./tokenStore";

const { META_APP_ID, META_APP_SECRET, REDIRECT_URI } = process.env;

if (!META_APP_ID || !META_APP_SECRET || !REDIRECT_URI) {
  throw new Error("META_APP_ID, META_APP_SECRET, and REDIRECT_URI env vars are required");
}

const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
].join(",");

interface PendingState {
  influencerId: string;
  createdAt: number;
}

// CSRF state token store — replace with Redis in production
const pendingStates = new Map<string, PendingState>();

interface AuthorizationUrlResult {
  url: string;
  state: string;
}

// ── Step 1 ────────────────────────────────────────────────────────────────────
export function buildAuthorizationUrl(influencerId: string): AuthorizationUrlResult {
  const state = crypto.randomBytes(16).toString("hex");

  pendingStates.set(state, { influencerId, createdAt: Date.now() });

  // Prune expired states (older than 10 minutes)
  const tenMinutes = 10 * 60 * 1000;
  for (const [key, value] of pendingStates.entries()) {
    if (Date.now() - value.createdAt > tenMinutes) pendingStates.delete(key);
  }

  const params = new URLSearchParams({
    client_id: META_APP_ID!,
    redirect_uri: REDIRECT_URI!,
    scope: SCOPES,
    response_type: "code",
    state,
  });

  return {
    url: `https://www.instagram.com/oauth/authorize?${params.toString()}`,
    state,
  };
}

// ── Step 2 ────────────────────────────────────────────────────────────────────
export async function handleCallback(code: string, state: string): Promise<string> {
  const pending = pendingStates.get(state);
  if (!pending) throw new Error("Invalid or expired state token — possible CSRF attempt");

  const { influencerId } = pending;
  pendingStates.delete(state); // one-time use

  interface ShortLivedTokenResponse {
    access_token: string;
    user_id: string;
  }

  const tokenResponse = await axios.post<ShortLivedTokenResponse>(
    "https://api.instagram.com/oauth/access_token",
    new URLSearchParams({
      client_id: META_APP_ID!,
      client_secret: META_APP_SECRET!,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI!,
      code,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  const { access_token: shortLivedToken, user_id: instagramUserId } = tokenResponse.data;
  await exchangeForLongLivedToken(influencerId, shortLivedToken, instagramUserId);
  return influencerId;
}

// ── Step 3 ────────────────────────────────────────────────────────────────────
async function exchangeForLongLivedToken(
  influencerId: string,
  shortLivedToken: string,
  instagramUserId: string
): Promise<void> {
  interface LongLivedTokenResponse {
    access_token: string;
    expires_in: number;
  }

  const response = await axios.get<LongLivedTokenResponse>(
    "https://graph.instagram.com/access_token",
    {
      params: {
        grant_type: "ig_exchange_token",
        client_secret: META_APP_SECRET,
        access_token: shortLivedToken,
      },
    }
  );

  const { access_token: longLivedToken, expires_in: expiresInSeconds } = response.data;

  const profileResponse = await axios.get<{ username: string }>(
    "https://graph.instagram.com/me",
    { params: { fields: "username", access_token: longLivedToken } }
  );

  saveToken(influencerId, {
    accessToken: longLivedToken,
    expiresInSeconds,
    instagramUserId,
    username: profileResponse.data.username,
  });

  console.log(`OAuth complete: @${profileResponse.data.username} connected`);
}

// ── Step 4 ────────────────────────────────────────────────────────────────────
export async function refreshToken(
  influencerId: string,
  currentAccessToken: string
): Promise<string> {
  interface RefreshResponse {
    access_token: string;
    expires_in: number;
  }

  const response = await axios.get<RefreshResponse>(
    "https://graph.instagram.com/refresh_access_token",
    { params: { grant_type: "ig_refresh_token", access_token: currentAccessToken } }
  );

  const { access_token: newToken, expires_in: newExpiresInSeconds } = response.data;
  updateToken(influencerId, newToken, newExpiresInSeconds);
  console.log(`Token refreshed for ${influencerId}`);
  return newToken;
}
