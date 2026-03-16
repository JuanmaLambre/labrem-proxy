import request from "supertest";
import express from "express";
import { corsMiddleware } from "../../src/middlewares/corsMiddleware.ts";

describe("corsMiddleware", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(corsMiddleware);
    app.get("/test", (req, res) => {
      res.json({ success: true });
    });
  });

  describe("CORS headers", () => {
    it("should add Access-Control-Allow-Origin header", async () => {
      const response = await request(app).get("/test");

      expect(response.headers["access-control-allow-origin"]).toBe("*");
    });

    it("should add Access-Control-Allow-Methods header", async () => {
      const response = await request(app).get("/test");

      expect(response.headers["access-control-allow-methods"]).toContain("GET");
      expect(response.headers["access-control-allow-methods"]).toContain("POST");
      expect(response.headers["access-control-allow-methods"]).toContain("PUT");
      expect(response.headers["access-control-allow-methods"]).toContain("DELETE");
    });

    it("should add Access-Control-Allow-Headers header", async () => {
      const response = await request(app).get("/test");

      expect(response.headers["access-control-allow-headers"]).toContain("Authorization");
      expect(response.headers["access-control-allow-headers"]).toContain("Content-Type");
    });

    it("should add Access-Control-Allow-Credentials header", async () => {
      const response = await request(app).get("/test");

      expect(response.headers["access-control-allow-credentials"]).toBe("true");
    });
  });

  describe("OPTIONS requests", () => {
    it("should respond with 200 status", async () => {
      const response = await request(app).options("/test");

      expect(response.status).toBe(200);
    });

    it("should not call next middleware for OPTIONS", async () => {
      const response = await request(app).options("/test");

      expect(response.body).not.toHaveProperty("success");
    });
  });

  describe("Non-OPTIONS requests", () => {
    it("should call next middleware", async () => {
      const response = await request(app).get("/test");

      expect(response.body).toHaveProperty("success", true);
    });
  });
});
