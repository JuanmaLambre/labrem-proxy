import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { targetMiddleware } from "../../src/middlewares/targetMiddleware.ts";
import * as cache from "../../src/auth/cache.ts";
import * as targets from "../../src/targets.ts";

jest.mock("../../src/auth/cache.ts");
jest.mock("../../src/targets.ts");

const mockedCache = cache as jest.Mocked<typeof cache>;
const mockedTargets = targets as jest.Mocked<typeof targets>;

const cachedEntry = {
  valid: true,
  fresh: true,
  timestamp: Date.now(),
  shift: {
    id: 1,
    day: "2026-01-01",
    start_time: "00:00:00",
    end_time: "23:59:59",
    availability: true,
    experience: { id: "exp-1", name: "Test Lab", body: "" },
  },
};

describe("targetMiddleware", () => {
  let app: express.Application;
  let capturedTarget: express.Request["target"];

  beforeEach(() => {
    jest.clearAllMocks();
    capturedTarget = undefined;
    mockedCache.fetchTokenCache.mockReturnValue(cachedEntry);
    mockedTargets.getTargets.mockReturnValue({ "exp-1": "http://target.example.com" });

    app = express();
    app.use(cookieParser());
    app.use(targetMiddleware);
    app.use((req, res) => {
      capturedTarget = req.target;
      res.json({ success: true });
    });
  });

  describe("when the target is found", () => {
    it("calls next middleware", async () => {
      const res = await request(app).get("/?accessToken=mytoken");
      expect(res.body).toEqual({ success: true });
    });

    it("sets req.target with the correct key and url", async () => {
      await request(app).get("/?accessToken=mytoken");
      expect(capturedTarget).toEqual({ valid: true, key: "exp-1", url: "http://target.example.com" });
    });

    it("reads the token from the accessToken query param", async () => {
      await request(app).get("/?accessToken=mytoken");
      expect(mockedCache.fetchTokenCache).toHaveBeenCalledWith("mytoken");
    });

    it("reads the token from the labrem_token cookie", async () => {
      await request(app).get("/").set("Cookie", ["labrem_token=mytoken"]);
      expect(mockedCache.fetchTokenCache).toHaveBeenCalledWith("mytoken");
    });
  });

  describe("when no target is configured for the experience", () => {
    beforeEach(() => {
      mockedTargets.getTargets.mockReturnValue({});
    });

    it("returns 502", async () => {
      const res = await request(app).get("/?accessToken=mytoken");
      expect(res.status).toBe(502);
      expect(res.body).toEqual({ error: "Bad Gateway", message: "No target server configured for this experience" });
    });

    it("does not call next middleware", async () => {
      await request(app).get("/?accessToken=mytoken");
      expect(capturedTarget).toBeUndefined();
    });
  });
});
