import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { authMiddleware } from "../src/middlewares/authMiddleware.ts";
import { corsMiddleware } from "../src/middlewares/corsMiddleware.ts";
import * as cache from "../src/auth/cache.ts";
import * as jwt from "../src/auth/jwt.ts";

jest.mock("../src/auth/cache.ts");
jest.mock("../src/auth/jwt.ts");

const mockedCache = cache as jest.Mocked<typeof cache>;
const mockedJwt = jwt as jest.Mocked<typeof jwt>;

const TODAY = new Date().toISOString().split("T")[0];

describe("Middleware Order", () => {
  let app: express.Application;
  const callOrder: string[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    callOrder.length = 0;

    mockedJwt.expiredToken.mockReturnValue(false);
    mockedJwt.getExpFromToken.mockReturnValue(Math.floor(Date.now() / 1000) + 3600);
    mockedCache.fetchTokenCache.mockReturnValue({
      valid: true,
      fresh: true,
      timestamp: Date.now(),
      shift: {
        id: 1,
        day: TODAY,
        start_time: "00:00:00",
        end_time: "23:59:59",
        availability: true,
        experience: { id: "exp-1", name: "Test Lab", body: "" },
      },
    });

    app = express();
    app.use(cookieParser());

    app.use((req, res, next) => {
      callOrder.push("cors");
      corsMiddleware(req, res, next);
    });

    app.use((req, res, next) => {
      callOrder.push("auth");
      authMiddleware(req, res, next);
    });

    app.use((req, res) => {
      callOrder.push("handler");
      res.json({ order: callOrder });
    });
  });

  it("calls corsMiddleware before authMiddleware", async () => {
    await request(app).get("/").set("Cookie", ["labrem_token=valid-token"]);
    expect(callOrder.indexOf("cors")).toBeLessThan(callOrder.indexOf("auth"));
  });

  it("calls authMiddleware before the handler", async () => {
    await request(app).get("/").set("Cookie", ["labrem_token=valid-token"]);
    expect(callOrder.indexOf("auth")).toBeLessThan(callOrder.indexOf("handler"));
  });

  it("has the correct order: cors -> auth -> handler", async () => {
    await request(app).get("/").set("Cookie", ["labrem_token=valid-token"]);
    expect(callOrder).toEqual(["cors", "auth", "handler"]);
  });

  it("stops at authMiddleware when no token is provided", async () => {
    mockedCache.fetchTokenCache.mockReturnValue(null);
    await request(app).get("/");
    expect(callOrder).toEqual(["cors", "auth"]);
    expect(callOrder).not.toContain("handler");
  });
});
