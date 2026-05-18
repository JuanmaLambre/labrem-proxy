import { Request, Response, NextFunction } from "express";
import { fetchTokenCache } from "../auth/cache.ts";
import { getTargets } from "../targets.ts";
import "../types/express.ts";
import { extractToken } from "./utils.ts";

interface TargetOpts {
  experienceId?: string;
  test?: boolean;
}

export function setTarget(req: Request, res: Response, opts: TargetOpts = {}) {
  const { experienceId, test = false } = opts;
  const targetUrl = getTargets()[experienceId!];

  if (!targetUrl) {
    return res.status(502).json({
      error: "Bad Gateway",
      message: "No target server configured for this experience",
      experience: experienceId || null,
    });
  }

  req.target = { valid: true, key: experienceId, url: targetUrl, test };
}

export function targetMiddleware(req: Request, res: Response, next: NextFunction): void | Response {
  if (req.target?.test) return next();

  const token = extractToken(req);
  const cached = fetchTokenCache(token!);
  const experienceId = cached?.shift?.experience?.id;

  setTarget(req, res, { experienceId });

  next();
}
