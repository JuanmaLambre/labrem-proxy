import targetServers from "../targets.json" with { type: "json" };

const TARGET_COOKIE_NAME = "labrem_target";

function getTargetServer(req) {
  // Priority: query param > cookie > default
  let targetKey = req.cookies?.[TARGET_COOKIE_NAME] || "default";

  return {
    valid: !!targetServers[targetKey],
    key: targetKey,
    url: targetServers[targetKey],
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

  // Attach target info to request
  req.targetServer = targetInfo;
  next();
}
