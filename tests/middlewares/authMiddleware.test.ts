import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import axios from "axios";
import { authMiddleware } from "../../src/middlewares/authMiddleware.ts";
import * as cache from "../../src/auth/cache.ts";

jest.mock("axios");
jest.mock("../../src/auth/cache.ts");

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedCache = cache as jest.Mocked<typeof cache>;

describe("authMiddleware", () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(cookieParser());

    // Mock request to have targetServer
    app.use((req, res, next) => {
      req.targetServer = {
        valid: true,
        key: "test-experience",
        url: "http://test.example.com",
      };
      next();
    });

    app.use(authMiddleware);

    app.get("/test", (req, res) => {
      res.json({ success: true });
    });
  });

  describe("when no token is present", () => {
    beforeEach(() => {
      mockedCache.fetchTokenCache.mockReturnValue(null);
    });

    it("should return 401 Unauthorized", async () => {
      const response = await request(app).get("/test");

      expect(response.status).toBe(401);
    });

    it("should return error message", async () => {
      const response = await request(app).get("/test");

      expect(response.body).toHaveProperty("error", "Unauthorized");
      expect(response.body).toHaveProperty("message");
    });

    it("should not call next middleware", async () => {
      const response = await request(app).get("/test");

      expect(response.body).not.toHaveProperty("success");
    });
  });

  describe("when token is in cache and valid", () => {
    beforeEach(() => {
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
            experience_id: "test-experience",
          },
        ],
      });
    });

    it("should return 200 OK", async () => {
      const response = await request(app)
        .get("/test")
        .set("Cookie", ["labrem_token=valid-token"]);

      expect(response.status).toBe(200);
    });

    it("should call next middleware", async () => {
      const response = await request(app)
        .get("/test")
        .set("Cookie", ["labrem_token=valid-token"]);

      expect(response.body).toHaveProperty("success", true);
    });

    it("should not call the API", async () => {
      await request(app)
        .get("/test")
        .set("Cookie", ["labrem_token=valid-token"]);

      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });

  describe("when token is in cache but invalid", () => {
    beforeEach(() => {
      mockedCache.fetchTokenCache.mockReturnValue({
        valid: false,
        fresh: true,
        timestamp: Date.now(),
      });
    });

    it("should return 401 Unauthorized", async () => {
      const response = await request(app)
        .get("/test")
        .set("Cookie", ["labrem_token=invalid-token"]);

      expect(response.status).toBe(401);
    });

    it("should return error message", async () => {
      const response = await request(app)
        .get("/test")
        .set("Cookie", ["labrem_token=invalid-token"]);

      expect(response.body.message).toBe("Token inválido");
    });
  });

  describe("when token is in cache with no active shift", () => {
    beforeEach(() => {
      mockedCache.fetchTokenCache.mockReturnValue({
        valid: true,
        fresh: true,
        timestamp: Date.now(),
        shifts: [
          {
            id: 1,
            name: "Test Shift",
            day: "2020-01-01", // Past date
            start_time: "00:00:00",
            end_time: "23:59:59",
            experience_id: "test-experience",
          },
        ],
      });
    });

    it("should return 401 Unauthorized", async () => {
      const response = await request(app)
        .get("/test")
        .set("Cookie", ["labrem_token=token-no-shift"]);

      expect(response.status).toBe(401);
    });

    it("should return no shifts available message", async () => {
      const response = await request(app)
        .get("/test")
        .set("Cookie", ["labrem_token=token-no-shift"]);

      expect(response.body.message).toBe("No hay turnos disponibles");
    });
  });

  describe("when token is not in cache", () => {
    beforeEach(() => {
      mockedCache.fetchTokenCache.mockReturnValue(null);
    });

    describe("and API returns valid shifts", () => {
      beforeEach(() => {
        mockedAxios.get.mockResolvedValue({
          status: 200,
          data: [
            {
              id: 1,
              name: "Test Shift",
              day: new Date().toISOString().split("T")[0],
              start_time: "00:00:00",
              end_time: "23:59:59",
              experience_id: "test-experience",
            },
          ],
        });
      });

      it("should return 200 OK", async () => {
        const response = await request(app)
          .get("/test")
          .set("Cookie", ["labrem_token=new-valid-token"]);

        expect(response.status).toBe(200);
      });

      it("should call the API with correct headers", async () => {
        await request(app)
          .get("/test")
          .set("Cookie", ["labrem_token=new-valid-token"]);

        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.stringContaining("/api/v1/shifts"),
          expect.objectContaining({
            headers: { Authorization: "Bearer new-valid-token" },
          })
        );
      });

      it("should cache the token", async () => {
        await request(app)
          .get("/test")
          .set("Cookie", ["labrem_token=new-valid-token"]);

        expect(mockedCache.setTokenCache).toHaveBeenCalledWith(
          "new-valid-token",
          expect.objectContaining({
            shifts: expect.any(Array),
          })
        );
      });
    });

    describe("and API returns error", () => {
      beforeEach(() => {
        mockedAxios.get.mockRejectedValue({
          response: { status: 401 },
          message: "Unauthorized",
        });
      });

      it("should return 401 Unauthorized", async () => {
        const response = await request(app)
          .get("/test")
          .set("Cookie", ["labrem_token=invalid-api-token"]);

        expect(response.status).toBe(401);
      });

      it("should cache the invalid token", async () => {
        await request(app)
          .get("/test")
          .set("Cookie", ["labrem_token=invalid-api-token"]);

        expect(mockedCache.setInvalidCache).toHaveBeenCalledWith("invalid-api-token");
      });
    });

    describe("and API returns valid shifts but none are active", () => {
      beforeEach(() => {
        mockedAxios.get.mockResolvedValue({
          status: 200,
          data: [
            {
              id: 1,
              name: "Past Shift",
              day: "2020-01-01",
              start_time: "00:00:00",
              end_time: "23:59:59",
              experience_id: "test-experience",
            },
          ],
        });
      });

      it("should return 401 Unauthorized", async () => {
        const response = await request(app)
          .get("/test")
          .set("Cookie", ["labrem_token=token-with-inactive-shifts"]);

        expect(response.status).toBe(401);
      });

      it("should return no shifts available message", async () => {
        const response = await request(app)
          .get("/test")
          .set("Cookie", ["labrem_token=token-with-inactive-shifts"]);

        expect(response.body.message).toBe("No hay turnos disponibles");
      });
    });

    describe("and API returns shifts for different experience", () => {
      beforeEach(() => {
        mockedAxios.get.mockResolvedValue({
          status: 200,
          data: [
            {
              id: 1,
              name: "Other Experience Shift",
              day: new Date().toISOString().split("T")[0],
              start_time: "00:00:00",
              end_time: "23:59:59",
              experience_id: "other-experience",
            },
          ],
        });
      });

      it("should return 401 Unauthorized", async () => {
        const response = await request(app)
          .get("/test")
          .set("Cookie", ["labrem_token=token-wrong-experience"]);

        expect(response.status).toBe(401);
      });
    });
  });

  describe("when cache is stale", () => {
    beforeEach(() => {
      // Mock stale cache (fresh: false)
      mockedCache.fetchTokenCache.mockReturnValue({
        valid: true,
        fresh: false,
        timestamp: Date.now() - 60000, // 60 seconds ago
        shifts: [],
      });

      // Mock cache delete
      mockedCache.cache = {
        del: jest.fn(),
      } as any;

      // Mock API call for revalidation
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: [
          {
            id: 1,
            name: "Fresh Shift",
            day: new Date().toISOString().split("T")[0],
            start_time: "00:00:00",
            end_time: "23:59:59",
            experience_id: "test-experience",
          },
        ],
      });
    });

    it("should revalidate with API", async () => {
      await request(app)
        .get("/test")
        .set("Cookie", ["labrem_token=stale-token"]);

      expect(mockedAxios.get).toHaveBeenCalled();
    });

    it("should delete stale cache", async () => {
      await request(app)
        .get("/test")
        .set("Cookie", ["labrem_token=stale-token"]);

      expect(mockedCache.cache.del).toHaveBeenCalledWith("stale-token");
    });
  });
});
