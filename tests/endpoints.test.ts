import request from "supertest";
import { app } from "../src/app.ts";

describe("Server Endpoints", () => {
  describe("GET /health", () => {
    it("should return status ok", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "ok");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("targets");
      expect(response.body).toHaveProperty("app", "LabRem proxy");
    });

    it("should return JSON content-type", async () => {
      const response = await request(app).get("/health");

      expect(response.headers["content-type"]).toMatch(/json/);
    });
  });

  describe("GET /login", () => {
    it("should return the login page HTML", async () => {
      const response = await request(app).get("/login");

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toMatch(/html/);
    });
  });
});
