import request from "supertest";
import axios from "axios";
import { app } from "../../src/app.ts";
import { cache } from "../../src/auth/cache.ts";
import * as mockedJwt from "../../src/auth/jwt.ts";
import { beforeEach } from "mocha";

jest.mock("axios");
jest.mock("../../src/auth/jwt.ts");
jest.mock("../../src/middlewares/proxyMiddleware.ts", () => ({
  proxyMiddleware: (req: any, res: any) => res.status(200).json({ proxied: true }),
}));
jest.mock("../../src/middlewares/targetMiddleware.ts", () => ({
  targetMiddleware: (req: any, res: any, next: any) => next(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

function createTestToken(payload: object): string {
  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${encode({ alg: "HS256" })}.${encode(payload)}.sig`;
}

beforeEach(() => {
  jest.clearAllMocks();
  cache.flushAll();
  (mockedJwt.expiredToken as jest.Mock).mockReturnValue(false);
  (mockedJwt.getExpFromToken as jest.Mock).mockReturnValue(Math.floor(Date.now() / 1000) + 3600);
});

describe("End-to-end tests", () => {
  describe("when no token is provided", () => {
    it("returns 401 with login message", async () => {
      const res = await request(app).get("/");
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized", message: "Necesita loguearse" });
    });
  });

  describe("when the token is expired", () => {
    it("returns 401 with expiry message", async () => {
      const token = createTestToken({ exp: Math.floor(Date.now() / 1000) - 60 });
      (mockedJwt.expiredToken as jest.Mock).mockReturnValue(true);

      const res = await request(app).get(`/?accessToken=${token}`);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized", message: "Experiencia finalizada" });
    });
  });

  describe("when the auth API returns 4xx", () => {
    it("returns 401", async () => {
      const token = createTestToken({ exp: Math.floor(Date.now() / 1000) + 3600 });
      mockedAxios.get.mockRejectedValue({ message: "Forbidden", response: { status: 403 } });

      const res = await request(app).get(`/?accessToken=${token}`);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized", message: "No se pudo obtener el turno asignado" });
    });
  });

  describe("when the auth API returns 5xx", () => {
    it("returns 401", async () => {
      const token = createTestToken({ exp: Math.floor(Date.now() / 1000) + 3600 });
      mockedAxios.get.mockRejectedValue({ message: "Internal Server Error", response: { status: 500 } });

      const res = await request(app).get(`/?accessToken=${token}`);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized", message: "Error al validar el token" });
    });

    describe("when it comes back up", () => {
      it("recovers on retry and returns the proxied", async () => {
        const TODAY = new Date().toISOString().split("T")[0];
        const token = createTestToken({ exp: Math.floor(Date.now() / 1000) + 3600 });
        const openShift = {
          status: 200,
          data: {
            assigned_shift: {
              shift_id: 1,
              shift_details: { day: TODAY, start_time: "00:00:00", end_time: "23:59:59", availability: true },
              experience: { id: "exp-1", name: "Test Lab", body: "" },
            },
          },
        };

        mockedAxios.get.mockRejectedValueOnce({ message: "Internal Server Error", response: { status: 500 } });
        const first = await request(app).get(`/?accessToken=${token}`);
        expect(first.status).toBe(401);

        mockedAxios.get.mockResolvedValueOnce(openShift);
        const second = await request(app).get(`/?accessToken=${token}`);
        expect(second.status).toBe(200);
        expect(second.body).toEqual({ proxied: true });
      });
    });
  });

  describe("when the shift is not yet open", () => {
    it("redirects to /proxy/espera with name + redirectIn", async () => {
      const token = createTestToken({ exp: Math.floor(Date.now() / 1000) + 3600 });
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: {
          assigned_shift: {
            shift_id: 1,
            shift_details: { day: tomorrow, start_time: "00:00:00", end_time: "23:59:59", availability: true },
            experience: { id: "exp-1", name: "Test Lab", body: "" },
          },
        },
      });

      const res = await request(app).get(`/?accessToken=${token}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/^\/proxy\/espera\?name=Test%20Lab&redirectIn=\d+$/);
    });
  });

  describe("when the shift is open", () => {
    const TODAY = new Date().toISOString().split("T")[0];
    let token: string;

    beforeEach(() => {
      token = createTestToken({ exp: Math.floor(Date.now() / 1000) + 3600 });
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: {
          assigned_shift: {
            shift_id: 1,
            shift_details: { day: TODAY, start_time: "00:00:00", end_time: "23:59:59", availability: true },
            experience: { id: "exp-1", name: "Test Lab", body: "" },
          },
        },
      });
    });

    it("sets labrem_token cookie", async () => {
      const res = await request(app).get(`/?accessToken=${token}`);
      expect(res.headers["set-cookie"]).toEqual(
        expect.arrayContaining([expect.stringContaining(`labrem_token=${token}`)]),
      );
    });

    it("forwards request to proxy", async () => {
      const res = await request(app).get(`/?accessToken=${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ proxied: true });
    });

    it("only calls the auth API once for two sequential requests with the same token", async () => {
      await request(app).get(`/?accessToken=${token}`);
      await request(app).get(`/?accessToken=${token}`);
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
  });
});
