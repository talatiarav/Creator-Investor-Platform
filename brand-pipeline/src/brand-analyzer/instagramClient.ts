// instagramClient.ts
// Fetches profile, recent image posts, and insights
// from the Instagram Graph API for a connected influencer.

import { InstagramProfile, InstagramPost, AccountInsights, MediaType } from "./types";

const GRAPH_API_VERSION = "v21.0";
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export async function getInfluencerProfile(accessToken: string): Promise<InstagramProfile> {
  const fields = [
    "id", "username", "name", "biography",
    "followers_count", "follows_count", "media_count",
    "website", "profile_picture_url",
  ].join(",");

  const res = await fetch(`${BASE_URL}/me?fields=${fields}&access_token=${accessToken}`);
  if (!res.ok) {
    const err = await res.json() as unknown;
    throw new Error(`Graph API profile error: ${JSON.stringify(err)}`);
  }

  return res.json() as Promise<InstagramProfile>;
}

export async function getRecentMedia(
  accessToken: string,
  limit = 15
): Promise<InstagramPost[]> {
  const fields = [
    "id", "media_type", "media_url", "thumbnail_url",
    "caption", "like_count", "comments_count", "timestamp", "permalink",
  ].join(",");

  const res = await fetch(
    `${BASE_URL}/me/media?fields=${fields}&limit=${limit}&access_token=${accessToken}`
  );

  if (!res.ok) {
    const err = await res.json() as unknown;
    throw new Error(`Graph API media error: ${JSON.stringify(err)}`);
  }

  const data = await res.json() as { data?: InstagramPost[] };
  const imagePosts: MediaType[] = ["IMAGE", "CAROUSEL_ALBUM"];

  return (data.data ?? []).filter((post) => imagePosts.includes(post.media_type));
}

export async function getAccountInsights(
  accessToken: string
): Promise<AccountInsights | null> {
  const metrics = ["reach", "impressions", "profile_views", "follower_count"].join(",");

  const res = await fetch(
    `${BASE_URL}/me/insights?metric=${metrics}&period=days_28&access_token=${accessToken}`
  );

  if (!res.ok) {
    console.warn("Could not fetch insights — account may not meet minimum follower threshold.");
    return null;
  }

  interface MetricValue { value: number; end_time: string; }
  interface MetricData { name: keyof AccountInsights; values: MetricValue[]; }

  const data = await res.json() as { data?: MetricData[] };
  const insights: AccountInsights = {};

  for (const metric of data.data ?? []) {
    const latestValue = metric.values[metric.values.length - 1]?.value;
    if (latestValue !== undefined) {
      insights[metric.name] = latestValue;
    }
  }

  return insights;
}
