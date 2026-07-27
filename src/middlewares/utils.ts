import { Request, Response } from "express";
import { getExpFromToken } from "../auth/jwt";

export const TOKEN_COOKIE_NAME = "labrem_token";

export function extractToken(req: Request): string | undefined {
  return req.query.accessToken || req.cookies?.[TOKEN_COOKIE_NAME];
}

export function setTokenCookie(token: string, res: Response) {
  const maxAge = Math.floor(getExpFromToken(token!)! - Date.now() / 1000);
  res.cookie(TOKEN_COOKIE_NAME, token, { maxAge });
}

export function buildTokenCookie(req: Request): string {
  const token = extractToken(req);
  const maxAge = Math.floor(getExpFromToken(token!)! - Date.now() / 1000);
  return `${TOKEN_COOKIE_NAME}=${token}; Path=/; ${maxAge ? `Max-Age=${maxAge};` : ""}`;
}

// True for a top-level page load (address bar / reload), false for background
// fetch/XHR polling. Used to decide whether an expired session should get an
// HTML redirect (browser navigation) or a plain 401 (background poll).
export function isTopLevelNavigation(req: Request): boolean {
  return req.headers["sec-fetch-mode"] === "navigate";
}
