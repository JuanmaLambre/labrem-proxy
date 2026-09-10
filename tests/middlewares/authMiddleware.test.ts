import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import axios from "axios";
import { authMiddleware } from "../../src/middlewares/authMiddleware.ts";
import * as cache from "../../src/auth/cache.ts";
import * as jwt from "../../src/auth/jwt.ts";
import * as pendingReboots from "../../src/pendingReboots.ts";

jest.mock("axios");
jest.mock("../../src/auth/cache.ts");
jest.mock("../../src/auth/jwt.ts");
jest.mock("../../src/pendingReboots.ts");

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedCache = cache as jest.Mocked<typeof cache>;
const mockedJwt = jwt as jest.Mocked<typeof jwt>;
const mockedPendingReboots = pendingReboots as jest.Mocked<typeof pendingReboots>;

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

const userData = { id: 1, name: "Test", surname: "User", email: "test@example.com", dni: "12345678" };

const openApiResponse = {
  status: 200,
  data: {
    user: userData,
    assignments: {
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

  afterEach(() => {
    jest.useRealTimers();
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

    describe("and the shift is cached", () => {
      const cachedShift = {
        valid: true,
        fresh: true,
        timestamp: Date.now(),
        shift: { ...openShiftData },
      };

      beforeEach(() => {
        mockedJwt.expiredToken.mockReturnValue(true);
        mockedCache.fetchTokenCache.mockReturnValue(cachedShift);
      });

      // rebootSweeper is the sole owner of reboots, firing from the on-disk
      // record; rebooting here as well would reboot the machine twice.
      it("does not schedule or fire a reboot", async () => {
        await request(app).get("/?accessToken=mytoken");
        expect(mockedPendingReboots.schedulePendingReboot).not.toHaveBeenCalled();
      });

      it("returns a plain 401 for a background poll (no Sec-Fetch-Mode)", async () => {
        const res = await request(app).get("/?accessToken=mytoken");
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: "Unauthorized", message: "Experiencia finalizada" });
      });

      it("redirects to /proxy/espera for a top-level page navigation", async () => {
        const res = await request(app)
          .get("/?accessToken=mytoken")
          .set("Sec-Fetch-Mode", "navigate");
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe("/proxy/espera?name=Test%20Lab&reason=finalizado");
      });
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
          user: userData,
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

      it("caches with fetched being false", async () => {
        await request(app).get("/?accessToken=mytoken");
        expect(mockedCache.setTokenCache).toHaveBeenCalledWith(
          "mytoken",
          expect.objectContaining({ fetched: false }),
        );
      });
    });

    describe("and the shift is not yet open", () => {
      beforeEach(() => {
        mockedCache.fetchTokenCache.mockReturnValue({
          valid: true,
          fresh: true,
          timestamp: Date.now(),
          shift: { ...openShiftData, day: TOMORROW },
          user: userData,
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

      it("caches the user information", async () => {
        await request(app).get("/?accessToken=mytoken");
        expect(mockedCache.setTokenCache).toHaveBeenCalledWith(
          "mytoken",
          expect.objectContaining({ user: userData }),
        );
      });

      it("caches with fetched being true", async () => {
        await request(app).get("/?accessToken=mytoken");
        expect(mockedCache.setTokenCache).toHaveBeenCalledWith(
          "mytoken",
          expect.objectContaining({ fetched: true }),
        );
      });

      it("sets the labrem_token cookie", async () => {
        const res = await request(app).get("/?accessToken=mytoken");
        expect(res.headers["set-cookie"]).toEqual(
          expect.arrayContaining([expect.stringContaining("labrem_token=mytoken")]),
        );
      });

      describe("recording a reboot at the token's own expiry", () => {
        const EXP_SECONDS = 1_800_000_000;

        beforeEach(() => {
          mockedJwt.getExpFromToken.mockReturnValue(EXP_SECONDS);
        });

        it("records the reboot against the token's expiry, keyed by shift", async () => {
          await request(app).get("/?accessToken=mytoken");

          expect(mockedPendingReboots.schedulePendingReboot).toHaveBeenCalledWith({
            shiftId: "1",
            experienceId: "exp-1",
            expiresAt: EXP_SECONDS * 1000,
          });
        });

        // De-duping now lives in the store, so the middleware is free to write
        // on every poll — but it must still hand over an identical record, or
        // the store would treat it as a new deadline.
        it("records the same shift identically on a later poll", async () => {
          await request(app).get("/?accessToken=mytoken");
          await request(app).get("/?accessToken=mytoken");

          const calls = mockedPendingReboots.schedulePendingReboot.mock.calls;
          expect(calls).toHaveLength(2);
          expect(calls[0]).toEqual(calls[1]);
        });

        it("records nothing when the token carries no usable expiry", async () => {
          mockedJwt.getExpFromToken.mockReturnValue(null);
          await request(app).get("/?accessToken=mytoken");

          expect(mockedPendingReboots.schedulePendingReboot).not.toHaveBeenCalled();
        });
      });
    });

    describe("and the API returns a shift not yet open", () => {
      beforeEach(() => {
        mockedAxios.get.mockResolvedValue({
          status: 200,
          data: {
            user: userData,
            assignments: {
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
