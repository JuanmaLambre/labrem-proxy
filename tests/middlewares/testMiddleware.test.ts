import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { testMiddleware } from "../../src/middlewares/testMiddleware.ts";
import * as targetMiddleware from "../../src/middlewares/targetMiddleware.ts";
import * as proxyMiddleware from "../../src/middlewares/proxyMiddleware.ts";
import config from "../../src/config.ts";

// Factory required: targets.ts has side-effectful module-level code (reads a JSON file)
// that would crash if executed during auto-mock creation of targetMiddleware.ts
jest.mock("../../src/targets.ts", () => ({ getTargets: jest.fn() }));
jest.mock("../../src/middlewares/targetMiddleware.ts");
jest.mock("../../src/middlewares/proxyMiddleware.ts");
jest.mock("../../src/config.ts", () => ({
  default: { testProxyEnabled: false },
}));

const mockedConfig = config as jest.Mocked<typeof config>;
const mockedSetTarget = targetMiddleware as jest.Mocked<typeof targetMiddleware>;
const mockedProxy = proxyMiddleware as jest.Mocked<typeof proxyMiddleware>;

describe("testMiddleware", () => {
  let app: express.Application;
  let nextCalled: boolean;

  beforeEach(() => {
    jest.clearAllMocks();
    nextCalled = false;

    mockedProxy.proxyMiddleware.mockImplementation((_req, res, _next) => {
      res.json({ proxied: true });
    });

    app = express();
    app.use(cookieParser());
    app.use(testMiddleware);
    app.use((_req, res) => {
      nextCalled = true;
      res.json({ next: true });
    });
  });

  describe("when testProxyEnabled is false", () => {
    beforeEach(() => {
      (mockedConfig as any).testProxyEnabled = false;
    });

    it("calls next regardless of cookie presence", async () => {
      const res = await request(app).get("/test").set("Cookie", ["test_destination=exp-1"]);
      expect(res.body).toEqual({ next: true });
      expect(mockedSetTarget.setTarget).not.toHaveBeenCalled();
      expect(mockedProxy.proxyMiddleware).not.toHaveBeenCalled();
    });

    it("calls next when no cookie is present", async () => {
      const res = await request(app).get("/test");
      expect(res.body).toEqual({ next: true });
    });
  });

  describe("when testProxyEnabled is true", () => {
    beforeEach(() => {
      (mockedConfig as any).testProxyEnabled = true;
    });

    describe("and the test_destination cookie is set", () => {
      it("calls setTarget with the experience id from the cookie", async () => {
        await request(app).get("/").set("Cookie", ["test_destination=exp-42"]);
        expect(mockedSetTarget.setTarget).toHaveBeenCalledWith(expect.anything(), expect.anything(), "exp-42");
      });

      it("calls proxyMiddleware instead of next", async () => {
        const res = await request(app).get("/").set("Cookie", ["test_destination=exp-42"]);
        expect(mockedProxy.proxyMiddleware).toHaveBeenCalled();
        expect(res.body).toEqual({ proxied: true });
      });
    });

    describe("and the test_destination cookie is missing", () => {
      it("calls next middleware", async () => {
        const res = await request(app).get("/");
        expect(res.body).toEqual({ next: true });
        expect(mockedSetTarget.setTarget).not.toHaveBeenCalled();
        expect(mockedProxy.proxyMiddleware).not.toHaveBeenCalled();
      });
    });
  });
});
