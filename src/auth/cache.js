import NodeCache from "node-cache";
import config from "../config.js";

// Initialize cache
// TTL: time before cached token expires
// checkperiod: how often to check for expired tokens
const cache = new NodeCache({
  stdTTL: config.cacheTtl,
  checkperiod: config.cacheCheckPeriod,
  useClones: false,
});

export { cache };
