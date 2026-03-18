import { Request, Response, NextFunction } from "express";
import axios from "axios";
import { cache, fetchTokenCache, setInvalidCache, setTokenCache } from "../auth/cache.ts";
import config from "../config.ts";
import { Shift, ShiftJSON } from "../../client/src/models/Shift.ts";
import "../types/express.ts";
import { expiredToken, getExpFromToken } from "../auth/jwt.ts";

const TOKEN_COOKIE_NAME = "labrem_token";

interface ShiftValidation {
  valid: boolean;
  shift?: ShiftJSON;
  invalid?: boolean; // Must mark token as not valid (false if auth server returns 500)
  message?: string;
}

interface TokenValidation {
  valid: boolean;
  message?: string;
  shift?: Shift;
}

function extractToken(req: Request): string | undefined {
  return req.query.accessToken || req.cookies?.[TOKEN_COOKIE_NAME];
}

async function fetchShift(token: string): Promise<ShiftValidation> {
  const response = await axios
    .get(`${config.authenticationUrl}/api/v1/experiences/shift/info`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .catch((err) => {
      console.error("Error fetching shifts from LabRem API:", err.message);
      return { status: err.response?.status || 500, data: null };
    });

  const statusCode = response.status.toString();
  if (statusCode.startsWith(4)) {
    return { invalid: true, valid: false, message: "No se pudieron obtener los turnos asignados" };
  } else if (statusCode.startsWith(2)) {
    const details = response.data.assigned_shift.shift_details;
    const experience = response.data.assigned_shift.experience;
    const id = response.data.assigned_shift.shift_id;

    return { valid: true, shift: { ...details, id, experience } };
  }
  return { invalid: false, valid: false };
}

async function validateToken(token: string | undefined): Promise<TokenValidation> {
  if (!token) return { valid: false, message: "Necesita loguearse" };

  // TODO: Redirect
  if (expiredToken(token)) return { valid: false, message: "Experiencia finalizada" };

  const cached = fetchTokenCache(token);

  if (cached && !cached.fresh) {
    console.log("Cache caducado");
    cache.del(token);
  } else if (cached) {
    if (!cached.valid) return { valid: false, message: "Token inválido" };

    console.log("Cache encontrado");
    const shift = new Shift(cached.shift!);

    if (shift.isOpen) {
      return { valid: true, shift };
    } else if (cached.fresh) {
      return { valid: false, message: "No hay turnos disponibles" };
    }
  }

  // No data in cache, let's fetch it
  console.log("Validating with LabRem API");
  const shiftValidation = await fetchShift(token);

  if (shiftValidation.invalid) {
    console.log("Token invalidado");
    setInvalidCache(token);
    return { valid: false, message: shiftValidation.message || "Error al validar el token" };
  }

  if (!shiftValidation.valid) {
    console.log("El token no se pudo verificar");
    return { valid: false, message: "Error de autenticación, vuelva a intentar" };
  }

  const shift = new Shift(shiftValidation.shift!);
  setTokenCache(token, { shift: shift.toJSON() });

  if (shift.isOpen) {
    return { valid: true, shift };
  } else {
    // TODO: Redirigir a página de espera
    return { valid: false, message: "La vacante no está abierta todavía" };
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  const token = extractToken(req);

  const validation = await validateToken(token);
  // const validation = { valid: true, message: "" };

  if (!validation.valid) {
    return res.status(401).json({
      error: "Unauthorized",
      message: validation.message,
    });
  }

  const maxAge = Math.floor(getExpFromToken(token!)! - Date.now() / 1000);
  res.cookie(TOKEN_COOKIE_NAME, token, { maxAge });

  next();
}
