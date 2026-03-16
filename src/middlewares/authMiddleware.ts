import { Request, Response, NextFunction } from "express";
import axios from "axios";
import { cache, fetchTokenCache, setInvalidCache, setTokenCache } from "../auth/cache.ts";
import config from "../config.ts";
import { Shift } from "../../client/src/models/Shift.ts";
import "../types/express.ts";

const TOKEN_COOKIE_NAME = "labrem_token";

interface ShiftValidation {
  valid: boolean;
  message?: string;
  shifts?: any[];
}

interface TokenValidation {
  valid: boolean;
  message?: string;
  userInfo?: any;
}

function extractToken(req: Request): string | undefined {
  return req.cookies?.[TOKEN_COOKIE_NAME];
}

async function fetchShifts(token: string): Promise<ShiftValidation> {
  const response = await axios
    .get(`${config.authenticationUrl}/api/v1/shifts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .catch((err) => {
      console.error("Error fetching shifts from LabRem API:", err.message);
      return { status: err.response?.status || 500, data: null };
    });

  if (response.status !== 200) {
    return { valid: false, message: "No se pudieron obtener los turnos asignados" };
  }

  return { valid: true, shifts: response.data };
}

function getActiveShift(shifts: Shift[], experienceId: string): Shift | undefined {
  return shifts.find((s) => s.isOpen && s.experienceId === experienceId);
}

async function validateToken(token: string | undefined, experienceId: string): Promise<TokenValidation> {
  if (!token) return { valid: false, message: "Necesita loguearse" };

  const cached = fetchTokenCache(token);
  if (cached) {
    if (!cached.valid) return { valid: false, message: "Token inválido" };

    const shifts = Shift.hydrateAll(cached.shifts || []);
    const activeShift = getActiveShift(shifts, experienceId);

    if (activeShift) {
      return { valid: true, userInfo: cached.userInfo };
    } else if (cached.fresh) {
      return { valid: false, message: "No hay turnos disponibles" };
    }

    // Cache data is considered stale, delete it and revalidate
    cache.del(token);
  }

  // No data in cache, let's fetch it
  console.log("Token not in cache, validating with LabRem API");
  const shiftsValidation = await fetchShifts(token);

  if (!shiftsValidation.valid) {
    setInvalidCache(token);
    return { valid: false, message: shiftsValidation.message || "Error al validar el token" };
  }

  setTokenCache(token, { shifts: shiftsValidation.shifts });
  const shifts = Shift.hydrateAll(shiftsValidation.shifts || []);
  const activeShift = getActiveShift(shifts, experienceId);

  if (activeShift) {
    return { valid: true };
  } else {
    return { valid: false, message: "No hay turnos disponibles" };
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  const token = extractToken(req);

  // const validation = await validateToken(token, req.targetServer?.key || "");
  const validation = { valid: true, message: "" };

  if (!validation.valid) {
    return res.status(401).json({
      error: "Unauthorized",
      message: validation.message,
    });
  }

  next();
}
