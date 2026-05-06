import { Request, Response, NextFunction } from "express";
import { setTarget } from "./targetMiddleware.ts";
import { proxyMiddleware } from "./proxyMiddleware.ts";
import config from "../config.ts";

const TEST_COOKIE_NAME = "test_destination";

export function testMiddleware(req: Request, res: Response, next: NextFunction): void | Response {
  const proxyEnabled = config.testProxyEnabled;
  if (proxyEnabled) console.warn("Test Proxy enabled");

  const experienceId = req.cookies?.[TEST_COOKIE_NAME];

  if (!experienceId || !proxyEnabled) return next();

  setTarget(req, res, experienceId);
  proxyMiddleware(req, res, next);
}
