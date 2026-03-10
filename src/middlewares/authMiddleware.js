import { cache } from "../auth/cache.js";

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  // Support both "Bearer TOKEN" and just "TOKEN"
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1];

  return authHeader;
}

function fetchAuthInfo(token) {
  const headers = { Authorization: `Bearer ${token}` };

  // TODO: Pegarle a la API de turnos

  return {
    valid: data.valid === true || response.status === 200,
    exitTime: data.exit_time || data.exitTime || data.exp || Date.now() / 1000 + 3600, // fallback to 1 hour
    userInfo: data,
  };
}

/**
 * Validate token and check exit time
 */
async function validateToken(token) {
  if (!token) return { valid: false, message: "No authentication token provided" };

  // Check cache first
  const cached = cache.get(token);
  if (cached) {
    console.log("Token found in cache");

    // Check if exit time has passed
    const now = Date.now() / 1000; // Current time in seconds
    if (now > cached.exitTime) {
      console.log("Token expired (exit time passed)");
      cache.del(token);
      return { valid: false, reason: "exit_time_exceeded" };
    }

    return { valid: true, userInfo: cached.userInfo };
  }

  // Not in cache, validate with OAuth API
  console.log("Token not in cache, validating with OAuth API");
  const validation = await validateTokenWithOAuth(token);

  if (!validation.valid) {
    return { valid: false, reason: "invalid_token" };
  }

  // Check exit time
  const now = Date.now() / 1000;
  if (now > validation.exitTime) {
    console.log("Token expired immediately after validation (exit time passed)");
    return { valid: false, reason: "exit_time_exceeded" };
  }

  // Cache the token with its exit time
  cache.set(token, {
    exitTime: validation.exitTime,
    userInfo: validation.userInfo,
  });

  console.log(`Token cached until ${new Date(validation.exitTime * 1000).toISOString()}`);

  return { valid: true, userInfo: validation.userInfo };
}

export async function authMiddleware(req, res, next) {
  return next();

  const token = extractToken(req);
  const validation = validateToken(token);

  if (!validation.valid) {
    return res.status(401).json({
      error: "Unauthorized",
      message: validation.message,
    });
  }

  try {
    const validation = await validateToken(token);

    if (!validation.valid) {
      return res.status(403).json({
        error: "Forbidden",
        message:
          validation.reason === "exit_time_exceeded" ? "Access time has expired" : "Invalid authentication token",
      });
    }

    // Attach user info to request for logging/debugging
    req.userInfo = validation.userInfo;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(503).json({
      error: "Service Unavailable",
      message: "Authentication service temporarily unavailable",
    });
  }
}
