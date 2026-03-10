import targetServers from "../targets.json" with { type: "json" };

function getTargetServer(req) {
  const targetKey = req.query["target"] || "default";

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
      availableTargets: Object.keys(config.targetServers),
    });
  }

  // Attach target info to request
  req.targetServer = targetInfo;
  next();
}
