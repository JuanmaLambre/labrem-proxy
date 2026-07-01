import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import axios from "axios";
import { analyticsMiddleware } from "../../src/middlewares/analyticsMiddleware.ts";
import * as cache from "../../src/auth/cache.ts";
import * as jwt from "../../src/auth/jwt.ts";

jest.mock("axios");
jest.mock("../../src/auth/cache.ts");
jest.mock("../../src/auth/jwt.ts");

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedCache = cache as jest.Mocked<typeof cache>;
const mockedJwt = jwt as jest.Mocked<typeof jwt>;

const TOKEN_DURATION = 3600;
const TOKEN_EXP = Math.floor(Date.now() / 1000) + TOKEN_DURATION;

const userData = { id: 1, name: "Test", surname: "User", email: "test@example.com", dni: "12345678" };
const shiftData = {
  id: 1,
  day: "2026-01-01",
  start_time: "00:00:00",
  end_time: "23:59:59",
  availability: true,
  experience: { id: "exp-1", name: "Test Lab", body: "" },
};

const baseCachedData = {
  valid: true,
  fresh: true,
  timestamp: Date.now(),
  shift: shiftData,
  user: userData,
  fetched: false,
};

describe("analyticsMiddleware", () => {
  let app: express.Application;
  let capturedHeaders: Record<string, string | string[] | undefined>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedCache.fetchTokenCache.mockReturnValue({ ...baseCachedData });
    mockedJwt.getTokenDuration.mockReturnValue(TOKEN_DURATION);
    mockedJwt.getExpFromToken.mockReturnValue(TOKEN_EXP);
    mockedAxios.post.mockResolvedValue({ status: 200 });

    app = express();
    app.use(cookieParser());
    app.use(analyticsMiddleware);
    app.use((req, res) => {
      capturedHeaders = req.headers;
      res.json({ success: true });
    });
  });

  it("always calls next middleware", async () => {
    const res = await request(app).get("/?accessToken=mytoken");
    expect(res.body).toEqual({ success: true });
  });

  describe("analytics session creation", () => {
    describe("when fetched from API", () => {
      beforeEach(() => {
        mockedCache.fetchTokenCache.mockReturnValue({ ...baseCachedData, fetched: true });
      });

      it("posts to the analytics API", async () => {
        await request(app).get("/?accessToken=mytoken");
        expect(mockedAxios.post).toHaveBeenCalledWith(
          expect.stringContaining("session_create.php"),
          expect.objectContaining({
            body: expect.objectContaining({
              session_id: "mytoken",
              student_name: "Test User",
              student_email: "test@example.com",
              experiment: "exp-1",
              duration: TOKEN_DURATION,
            }),
          }),
        );
      });
    });

    describe("when served from cache", () => {
      beforeEach(() => {
        mockedCache.fetchTokenCache.mockReturnValue({ ...baseCachedData, fetched: false });
      });

      it("does not call the analytics API", async () => {
        await request(app).get("/?accessToken=mytoken");
        expect(mockedAxios.post).not.toHaveBeenCalled();
      });
    });
  });

  describe("request headers", () => {
    it("sets x-via-gwlabremotos to 1", async () => {
      await request(app).get("/?accessToken=mytoken");
      expect(capturedHeaders["x-via-gwlabremotos"]).toBe("1");
    });

    it("sets x-session-id to the token", async () => {
      await request(app).get("/?accessToken=mytoken");
      expect(capturedHeaders["x-session-id"]).toBe("mytoken");
    });

    it("sets x-session-duration from getTokenDuration", async () => {
      await request(app).get("/?accessToken=mytoken");
      expect(capturedHeaders["x-session-duration"]).toBe(TOKEN_DURATION.toString());
    });

    it("sets x-session-expires-at from getExpFromToken", async () => {
      await request(app).get("/?accessToken=mytoken");
      expect(capturedHeaders["x-session-expires-at"]).toBe(TOKEN_EXP.toString());
    });

    it("sets x-student-name to user fullname", async () => {
      await request(app).get("/?accessToken=mytoken");
      expect(capturedHeaders["x-student-name"]).toBe("Test User");
    });

    it("sets x-student-email to user email", async () => {
      await request(app).get("/?accessToken=mytoken");
      expect(capturedHeaders["x-student-email"]).toBe("test@example.com");
    });

    describe("when no user is in cache", () => {
      beforeEach(() => {
        mockedCache.fetchTokenCache.mockReturnValue({ ...baseCachedData, user: undefined });
      });

      it("sets x-student-name to empty string", async () => {
        await request(app).get("/?accessToken=mytoken");
        expect(capturedHeaders["x-student-name"]).toBe("");
      });

      it("sets x-student-email to empty string", async () => {
        await request(app).get("/?accessToken=mytoken");
        expect(capturedHeaders["x-student-email"]).toBe("");
      });
    });
  });
});
