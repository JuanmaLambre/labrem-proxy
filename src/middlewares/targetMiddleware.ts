import { Request, Response, NextFunction } from "express";
import type { TargetInfo } from "../types/express.ts";
import targetServers from "../targets.json" with { type: "json" };

const TARGET_COOKIE_NAME = "labrem_target";

function getTargetServer(req: Request): TargetInfo {
  const targetKey = req.cookies?.[TARGET_COOKIE_NAME];
  const url = (targetServers as any)[targetKey];

  return {
    valid: !!url,
    key: targetKey,
    url,
  };
}

/**
 * Target validation middleware
 */
export function targetMiddleware(req: Request, res: Response, next: NextFunction): void | Response {
  const targetInfo = getTargetServer(req);

  if (!targetInfo.valid) {
    return res.status(400).json({
      error: "Bad Request",
      target: targetInfo.key,
      availableTargets: Object.keys(targetServers),
    });
  }

  // Attach target info to request
  req.targetServer = targetInfo;
  next();
}
