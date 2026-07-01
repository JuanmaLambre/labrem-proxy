import axios from "axios";
import { Request, Response, NextFunction } from "express";
import { CachedTokenData, fetchTokenCache } from "../auth/cache.ts";
import { extractToken } from "./utils.ts";
import { User } from "../../client/src/models/User.ts";
import { Shift } from "../../client/src/models/Shift.ts";
import { getExpFromToken, getTokenDuration } from "../auth/jwt.ts";

const ANALYTICS_URL = "http://localhost/analytics/session_create.php";

async function createAnalyticsSession(token: string, cache: CachedTokenData) {
  const { user: userData, shift: shiftData } = cache;
  const user = userData ? new User(userData) : null;
  const shift = new Shift(shiftData!);

  await axios.post(ANALYTICS_URL, {
    headers: { "Content-Type": "application/json" },
    body: {
      session_id: token,
      student_name: user?.fullname,
      student_email: user?.email,
      experiment: shift.experience.id,
      duration: getTokenDuration(token),
    },
  });
}

function appendAnalyticsHeaders(req: Request, token: string, cache: CachedTokenData) {
  const { user: userData, shift: shiftData } = cache;
  const user = userData ? new User(userData) : null;
  const shift = new Shift(shiftData!);

  req.headers["x-via-gwlabremotos"] = "1";
  req.headers["x-session-id"] = token;
  req.headers["x-session-duration"] = getTokenDuration(token).toString();
  req.headers["x-session-expires-at"] = getExpFromToken(token)!.toString();
  req.headers["x-student-name"] = user?.fullname || "";
  req.headers["x-student-email"] = user?.email || "";
}

export async function analyticsMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req)!;
  const cache = fetchTokenCache(token)!;

  if (cache.fetched) await createAnalyticsSession(token, cache);

  appendAnalyticsHeaders(req, token, cache);

  next();
}
