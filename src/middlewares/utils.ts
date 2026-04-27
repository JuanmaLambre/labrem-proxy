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
