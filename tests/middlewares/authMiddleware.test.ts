import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import axios from "axios";
import { authMiddleware } from "../../src/middlewares/authMiddleware.ts";
import * as cache from "../../src/auth/cache.ts";
import * as jwt from "../../src/auth/jwt.ts";

jest.mock("axios");
jest.mock("../../src/auth/cache.ts");
jest.mock("../../src/auth/jwt.ts");

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedCache = cache as jest.Mocked<typeof cache>;
const mockedJwt = jwt as jest.Mocked<typeof jwt>;

function dateToString(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const TODAY = dateToString(new Date());
const TOMORROW = dateToString(new Date(Date.now() + 24 * 60 * 60 * 1000));

const openShiftData = {
  id: 1,
  day: TODAY,
  start_time: "00:00:00",
  end_time: "23:59:59",
  availability: true,
  experience: { id: "exp-1", name: "Test Lab", body: "" },
};

const openApiResponse = {
  status: 200,
  data: {
    assigned_shift: {
      shift_id: 1,
      shift_details: { day: TODAY, start_time: "00:00:00", end_time: "23:59:59", availability: true },
      experience: { id: "exp-1", name: "Test Lab", body: "" },
    },
  },
};

describe("authMiddleware", () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedCache.fetchTokenCache.mockReturnValue(null);
    mockedJwt.expiredToken.mockReturnValue(false);
    mockedJwt.getExpFromToken.mockReturnValue(Math.floor(Date.now() / 1000) + 3600);

    app = express();
    app.use(cookieParser());
    app.use(authMiddleware);
    app.use((req, res) => res.json({ success: true }));
  });

  describe("token extraction", () => {
    it("returns 401 when no token is provided", async () => {
      const res = await request(app).get("/");
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized", message: "Necesita loguearse" });
    });

    it("reads the token from the accessToken query param", async () => {
      mockedAxios.get.mockResolvedValue(openApiResponse);
      await request(app).get("/?accessToken=mytoken");
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: { Authorization: "Bearer mytoken" } }),
      );
    });

    it("reads the token from the labrem_token cookie", async () => {
      mockedAxios.get.mockResolvedValue(openApiResponse);
      await request(app).get("/").set("Cookie", ["labrem_token=mytoken"]);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: { Authorization: "Bearer mytoken" } }),
      );
    });
  });

  describe("when the token is expired", () => {
    it("returns 401 with expiry message", async () => {
      mockedJwt.expiredToken.mockReturnValue(true);
      const res = await request(app).get("/?accessToken=mytoken");
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized", message: "Experiencia finalizada" });
    });

    it("does not call the auth API", async () => {
      mockedJwt.expiredToken.mockReturnValue(true);
      await request(app).get("/?accessToken=mytoken");
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });

  describe("when the token is in a fresh cache", () => {
    describe("and it is invalid", () => {
      beforeEach(() => {
        mockedCache.fetchTokenCache.mockReturnValue({ valid: false, fresh: true, timestamp: Date.now() });
      });

      it("returns 401", async () => {
        const res = await request(app).get("/?accessToken=mytoken");
        expect(res.status).toBe(401);
        expect(res.body.message).toBe("Token inválido");
      });

      it("does not call the auth API", async () => {
        await request(app).get("/?accessToken=mytoken");
        expect(mockedAxios.get).not.toHaveBeenCalled();
      });
    });

    describe("and the shift is open", () => {
      beforeEach(() => {
        mockedCache.fetchTokenCache.mockReturnValue({
          valid: true,
          fresh: true,
          timestamp: Date.now(),
          shift: openShiftData,
        });
      });

      it("calls next middleware", async () => {
        const res = await request(app).get("/?accessToken=mytoken");
        expect(res.body).toEqual({ success: true });
      });

      it("does not call the auth API", async () => {
        await request(app).get("/?accessToken=mytoken");
        expect(mockedAxios.get).not.toHaveBeenCalled();
      });
    });

    describe("and the shift is not yet open", () => {
      beforeEach(() => {
        mockedCache.fetchTokenCache.mockReturnValue({
          valid: true,
          fresh: true,
          timestamp: Date.now(),
          shift: { ...openShiftData, day: TOMORROW },
        });
      });

      it("returns 401 with no shifts available message", async () => {
        const res = await request(app).get("/?accessToken=mytoken");
        expect(res.status).toBe(401);
        expect(res.body.message).toBe("No hay turnos disponibles");
      });

      it("does not call the auth API", async () => {
        await request(app).get("/?accessToken=mytoken");
        expect(mockedAxios.get).not.toHaveBeenCalled();
      });
    });
  });

  describe("when the cache is stale", () => {
    beforeEach(() => {
      mockedCache.fetchTokenCache.mockReturnValue({
        valid: true,
        fresh: false,
        timestamp: Date.now() - 120000,
        shift: openShiftData,
      });
      mockedCache.cache.del = jest.fn();
      mockedAxios.get.mockResolvedValue(openApiResponse);
    });

    it("deletes the stale cache entry", async () => {
      await request(app).get("/?accessToken=mytoken");
      expect(mockedCache.cache.del).toHaveBeenCalledWith("mytoken");
    });

    it("revalidates with the auth API", async () => {
      await request(app).get("/?accessToken=mytoken");
      expect(mockedAxios.get).toHaveBeenCalled();
    });
  });

  describe("when the token is not in cache", () => {
    it("calls the auth API with the correct endpoint and Bearer token", async () => {
      mockedAxios.get.mockResolvedValue(openApiResponse);
      await request(app).get("/?accessToken=mytoken");
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/experiences/shift/info"),
        expect.objectContaining({ headers: { Authorization: "Bearer mytoken" } }),
      );
    });

    describe("and the API returns 4xx", () => {
      beforeEach(() => {
        mockedAxios.get.mockRejectedValue({ message: "Forbidden", response: { status: 403 } });
      });

      it("returns 401", async () => {
        const res = await request(app).get("/?accessToken=mytoken");
        expect(res.status).toBe(401);
      });

      it("marks the token as invalid in cache", async () => {
        await request(app).get("/?accessToken=mytoken");
        expect(mockedCache.setInvalidCache).toHaveBeenCalledWith("mytoken");
      });
    });

    describe("and the API returns 5xx", () => {
      beforeEach(() => {
        mockedAxios.get.mockRejectedValue({ message: "Internal Server Error", response: { status: 500 } });
      });

      it("returns 401", async () => {
        const res = await request(app).get("/?accessToken=mytoken");
        expect(res.status).toBe(401);
      });

      it("does not mark the token as invalid in cache", async () => {
        await request(app).get("/?accessToken=mytoken");
        expect(mockedCache.setInvalidCache).not.toHaveBeenCalled();
      });
    });

    describe("and the API returns an open shift", () => {
      beforeEach(() => {
        mockedAxios.get.mockResolvedValue(openApiResponse);
      });

      it("calls next middleware", async () => {
        const res = await request(app).get("/?accessToken=mytoken");
        expect(res.body).toEqual({ success: true });
      });

      it("caches the token", async () => {
        await request(app).get("/?accessToken=mytoken");
        expect(mockedCache.setTokenCache).toHaveBeenCalledWith(
          "mytoken",
          expect.objectContaining({ shift: expect.any(Object) }),
        );
      });

      it("sets the labrem_token cookie", async () => {
        const res = await request(app).get("/?accessToken=mytoken");
        expect(res.headers["set-cookie"]).toEqual(
          expect.arrayContaining([expect.stringContaining("labrem_token=mytoken")]),
        );
      });
    });

    describe("and the API returns a shift not yet open", () => {
      beforeEach(() => {
        mockedAxios.get.mockResolvedValue({
          status: 200,
          data: {
            assigned_shift: {
              shift_id: 1,
              shift_details: { day: TOMORROW, start_time: "00:00:00", end_time: "23:59:59", availability: true },
              experience: { id: "exp-1", name: "Test Lab", body: "" },
            },
          },
        });
      });

      it("redirects to /proxy/espera with name and redirectIn", async () => {
        const res = await request(app).get("/?accessToken=mytoken");
        expect(res.status).toBe(302);
        expect(res.headers.location).toMatch(/^\/proxy\/espera\?name=Test%20Lab&redirectIn=\d+$/);
      });

      it("caches the token", async () => {
        await request(app).get("/?accessToken=mytoken");
        expect(mockedCache.setTokenCache).toHaveBeenCalled();
      });
    });
  });
});
