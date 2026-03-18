import NodeCache from "node-cache";
import config from "../config.ts";
import { expiredToken } from "./jwt.ts";
import { ShiftJSON } from "../../client/src/models/Shift.ts";

const FRESHNESS_THRESHOLD = 60; // Seconds

export interface CachedTokenData {
  timestamp: number;
  valid: boolean;
  shift?: ShiftJSON;
  userInfo?: any;
  exitTime?: number;
  fresh: boolean;
}

// Initialize cache
// TTL: time before cached token expires
// checkperiod: how often to check for expired tokens
const cache = new NodeCache({
  stdTTL: config.cacheTtl,
  checkperiod: config.cacheCheckPeriod,
  useClones: false,
});

export function fetchTokenCache(token: string): CachedTokenData | null {
  if (!token) return null;

  const data = cache.get<CachedTokenData>(token);
  if (!data) return null;

  return {
    ...data,
    fresh: !!data.timestamp && (Date.now() - data.timestamp) / 1000 < FRESHNESS_THRESHOLD,
  };
}

export function setTokenCache(token: string, data: Partial<CachedTokenData>): void {
  cache.set(token, { ...data, timestamp: Date.now(), valid: true });
}

export function setInvalidCache(token: string, data: Partial<CachedTokenData> = {}): void {
  cache.set(token, { ...data, timestamp: Date.now(), valid: false });
}

export { cache };
