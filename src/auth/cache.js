import NodeCache from "node-cache";
import config from "../config.js";
import { expiredToken } from "../../client/src/auth/utils/jwt.js";

const FRESHNESS_THRESHOLD = 10; // Seconds

// Initialize cache
// TTL: time before cached token expires
// checkperiod: how often to check for expired tokens
const cache = new NodeCache({
  stdTTL: config.cacheTtl,
  checkperiod: config.cacheCheckPeriod,
  useClones: false,
});

export function fetchTokenCache(token) {
  if (!token) return null;

  if (expiredToken(token)) return null;

  const data = cache.get(token);
  if (!data) return null;

  return {
    ...data,
    fresh: data.timestamp && (Date.now() - data.timestamp) / 1000 < FRESHNESS_THRESHOLD,
  };
}

export function setTokenCache(token, data) {
  cache.set(token, { ...data, timestamp: Date.now(), valid: true });
}

export function setInvalidCache(token, data = {}) {
  cache.set(token, { ...data, timestamp: Date.now(), valid: false });
}

export { cache };
