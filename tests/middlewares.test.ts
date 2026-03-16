import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { targetMiddleware } from "../src/middlewares/targetMiddleware.ts";
import { authMiddleware } from "../src/middlewares/authMiddleware.ts";
import { corsMiddleware } from "../src/middlewares/corsMiddleware.ts";
import * as cache from "../src/auth/cache.ts";

jest.mock("../src/auth/cache.ts");

const mockedCache = cache as jest.Mocked<typeof cache>;

describe("Middleware Order", () => {
  let app: express.Application;
  const callOrder: string[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    callOrder.length = 0;

    // Mock valid authentication
    mockedCache.fetchTokenCache.mockReturnValue({
      valid: true,
      fresh: true,
      timestamp: Date.now(),
      shifts: [
        {
          id: 1,
          name: "Test Shift",
          day: new Date().toISOString().split("T")[0],
          start_time: "00:00:00",
          end_time: "23:59:59",
          experience_id: "juanma",
        },
      ],
    });

    app = express();
    app.use(cookieParser());
    app.use(corsMiddleware);

    // Wrap middlewares to track call order
    app.use((req, res, next) => {
      callOrder.push("target");
      targetMiddleware(req, res, next);
    });

    app.use((req, res, next) => {
      callOrder.push("auth");
      authMiddleware(req, res, next);
    });

    app.get("/test", (req, res) => {
      callOrder.push("handler");
      res.json({ order: callOrder });
    });
  });

  it("should call targetMiddleware before authMiddleware", async () => {
    await request(app)
      .get("/test")
      .set("Cookie", ["labrem_target=juanma", "labrem_token=valid-token"]);

    expect(callOrder.indexOf("target")).toBeLessThan(callOrder.indexOf("auth"));
  });

  it("should call authMiddleware before route handler", async () => {
    await request(app)
      .get("/test")
      .set("Cookie", ["labrem_target=juanma", "labrem_token=valid-token"]);

    expect(callOrder.indexOf("auth")).toBeLessThan(callOrder.indexOf("handler"));
  });

  it("should have correct order: target -> auth -> handler", async () => {
    await request(app)
      .get("/test")
      .set("Cookie", ["labrem_target=juanma", "labrem_token=valid-token"]);

    expect(callOrder).toEqual(["target", "auth", "handler"]);
  });

  it("should stop at targetMiddleware if target is invalid", async () => {
    await request(app).get("/test");

    expect(callOrder).toEqual(["target"]);
    expect(callOrder).not.toContain("auth");
    expect(callOrder).not.toContain("handler");
  });
});
