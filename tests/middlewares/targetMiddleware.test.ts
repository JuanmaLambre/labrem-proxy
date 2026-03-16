import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { targetMiddleware } from "../../src/middlewares/targetMiddleware.ts";

describe("targetMiddleware", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(cookieParser());
    app.use(targetMiddleware);
    app.get("/test", (req, res) => {
      res.json({ success: true, target: req.targetServer });
    });
  });

  describe("when no cookie is present", () => {
    it("should return 400 Bad Request", async () => {
      const response = await request(app).get("/test");

      expect(response.status).toBe(400);
    });

    it("should return error message", async () => {
      const response = await request(app).get("/test");

      expect(response.body).toHaveProperty("error", "Bad Request");
    });

    it("should include available targets", async () => {
      const response = await request(app).get("/test");

      expect(response.body).toHaveProperty("availableTargets");
      expect(Array.isArray(response.body.availableTargets)).toBe(true);
    });
  });

  describe("when cookie value is invalid", () => {
    it("should return 400 Bad Request", async () => {
      const response = await request(app).get("/test").set("Cookie", ["labrem_target=invalid_target"]);

      expect(response.status).toBe(400);
    });

    it("should include the invalid target in response", async () => {
      const response = await request(app).get("/test").set("Cookie", ["labrem_target=invalid_target"]);

      expect(response.body).toHaveProperty("target", "invalid_target");
    });

    it("should list available targets", async () => {
      const response = await request(app).get("/test").set("Cookie", ["labrem_target=invalid_target"]);

      expect(response.body).toHaveProperty("availableTargets");
    });
  });

  describe("when cookie value is valid", () => {
    it("should return 200 OK", async () => {
      const response = await request(app).get("/test").set("Cookie", ["labrem_target=juanma"]);

      expect(response.status).toBe(200);
    });

    it("should attach targetServer to request", async () => {
      const response = await request(app).get("/test").set("Cookie", ["labrem_target=juanma"]);

      expect(response.body.target).toHaveProperty("valid", true);
      expect(response.body.target).toHaveProperty("key", "juanma");
      expect(response.body.target).toHaveProperty("url");
    });

    it("should call next middleware", async () => {
      const response = await request(app).get("/test").set("Cookie", ["labrem_target=juanma"]);

      expect(response.body).toHaveProperty("success", true);
    });
  });
});
