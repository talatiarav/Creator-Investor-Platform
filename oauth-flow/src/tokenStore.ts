// tokenStore.ts
// Encrypted in-memory token storage.
// Replace the Map with PostgreSQL calls in Phase 1 of the hardening roadmap.
// The function signatures and TokenRecord type stay identical — only the
// storage backend changes, so callers need no updates.

import CryptoJS from "crypto-js";
import { TokenRecord, SaveTokenParams } from "./types";

const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) throw new Error("TOKEN_ENCRYPTION_KEY env var is required");

// In-memory store — swap for PostgreSQL in production
// Key: influencerId, Value: encrypted token record
interface StoredRecord {
  encryptedToken: string;
  expiresAt: string;
  instagramUserId: string;
  username: string;
  connectedAt: string;
}

const store = new Map<string, StoredRecord>();

function encryptToken(plaintext: string): string {
  return CryptoJS.AES.encrypt(plaintext, ENCRYPTION_KEY!).toString();
}

function decryptToken(encrypted: string): string {
  return CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY!).toString(CryptoJS.enc.Utf8);
}

export function saveToken(influencerId: string, params: SaveTokenParams): void {
  const { accessToken, expiresInSeconds, instagramUserId, username } = params;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  store.set(influencerId, {
    encryptedToken: encryptToken(accessToken),
    expiresAt,
    instagramUserId,
    username,
    connectedAt: new Date().toISOString(),
  });

  console.log(`Token saved for @${username}, expires ${expiresAt}`);
}

export function getToken(influencerId: string): TokenRecord | null {
  const record = store.get(influencerId);
  if (!record) return null;

  if (new Date(record.expiresAt) < new Date()) {
    console.warn(`Token for ${influencerId} has expired`);
    return null;
  }

  return {
    accessToken: decryptToken(record.encryptedToken),
    expiresAt: record.expiresAt,
    instagramUserId: record.instagramUserId,
    username: record.username,
    connectedAt: record.connectedAt,
  };
}

export function updateToken(
  influencerId: string,
  newAccessToken: string,
  newExpiresInSeconds: number
): void {
  const existing = store.get(influencerId);
  if (!existing) throw new Error(`No token record found for ${influencerId}`);

  existing.encryptedToken = encryptToken(newAccessToken);
  existing.expiresAt = new Date(Date.now() + newExpiresInSeconds * 1000).toISOString();
  store.set(influencerId, existing);

  console.log(`Token refreshed for ${influencerId}`);
}

export function getExpiringTokens(withinDays = 10): string[] {
  const threshold = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
  const expiring: string[] = [];

  for (const [id, record] of store.entries()) {
    if (new Date(record.expiresAt) < threshold) expiring.push(id);
  }

  return expiring;
}

export function deleteToken(influencerId: string): void {
  store.delete(influencerId);
  console.log(`Token deleted for ${influencerId}`);
}

export function isConnected(influencerId: string): boolean {
  return getToken(influencerId) !== null;
}
