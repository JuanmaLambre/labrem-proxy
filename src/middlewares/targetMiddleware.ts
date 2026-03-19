import { Request, Response, NextFunction } from "express";
import { fetchTokenCache } from "../auth/cache.ts";
import { getTargets } from "../targets.ts";
import "../types/express.ts";

const TOKEN_COOKIE_NAME = "labrem_token";

export function targetMiddleware(req: Request, res: Response, next: NextFunction): void | Response {
  const token = req.cookies?.[TOKEN_COOKIE_NAME];
  const cached = fetchTokenCache(token!);
  const experienceId = cached?.shift?.experience?.id;
  const targetUrl = getTargets()[experienceId!];

  if (!targetUrl) {
    return res.status(502).json({
      error: "Bad Gateway",
      message: "No target server configured for this experience",
    });
  }

  req.target = { valid: true, key: experienceId!, url: targetUrl };
  next();
}
