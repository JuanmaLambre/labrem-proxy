import { Request } from "express";

export const TOKEN_COOKIE_NAME = "labrem_token";

export function extractToken(req: Request): string | undefined {
  return req.query.accessToken || req.cookies?.[TOKEN_COOKIE_NAME];
}

export function buildTokenCookie(req: Request, maxAge?: number): string {
  const token = extractToken(req);
  return `${TOKEN_COOKIE_NAME}=${token}; Path=/; ${maxAge ? `Max-Age=${maxAge};` : ""}`;
}
