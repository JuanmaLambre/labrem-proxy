import { Request } from "express";

export const TOKEN_COOKIE_NAME = "labrem_token";

export function extractToken(req: Request): string | undefined {
  return req.query.accessToken || req.cookies?.[TOKEN_COOKIE_NAME];
}
