import targetServers from "../targets.json" with { type: "json" };

const TARGET_COOKIE_NAME = "labrem_target";

function getTargetServer(req) {
  // Priority: query param > cookie > default
  let targetKey = req.query["experiencia"] || req.cookies?.[TARGET_COOKIE_NAME] || "default";

  return {
    valid: !!targetServers[targetKey],
    key: targetKey,
    url: targetServers[targetKey],
    fromQuery: !!req.query["experiencia"],
  };
}

/**
 * Target validation middleware
 */
export function targetMiddleware(req, res, next) {
  const targetInfo = getTargetServer(req);

  if (!targetInfo.valid) {
    return res.status(400).json({
      error: "Bad Request",
      message: targetInfo.error,
      availableTargets: Object.keys(targetServers),
    });
  }

  // If target came from query parameter, set/update the cookie
  if (targetInfo.fromQuery) {
    res.cookie(TARGET_COOKIE_NAME, targetInfo.key, {
      httpOnly: true, // Prevent JavaScript access (security)
      secure: process.env.HTTPS_ENABLED === "true", // Only send over HTTPS if enabled
      sameSite: "lax", // CSRF protection
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
    console.log(`Set target cookie: ${targetInfo.key} for ${req.ip}`);
  }

  // Attach target info to request
  req.targetServer = targetInfo;
  next();
}
