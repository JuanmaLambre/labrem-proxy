import "../types/express.ts";
import { Request, Response, NextFunction } from "express";
import axios from "axios";
import { cache, fetchTokenCache, setInvalidCache, setTokenCache } from "../auth/cache.ts";
import config from "../config.ts";
import { Shift } from "../../client/src/models/Shift.ts";
import { User } from "../../client/src/models/User.ts";
import { expiredToken } from "../auth/jwt.ts";
import { extractToken, setTokenCookie } from "./utils.ts";

interface ShiftValidation {
  valid: boolean;
  shift?: Shift;
  user?: User;
  invalid?: boolean; // Must mark token as not valid (false if auth server returns 500)
  message?: string;
  fetched?: boolean;
}

interface TokenValidation {
  valid: boolean;
  message?: string;
  shift?: Shift;
  redirectTo?: string;
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
    const message = response.data?.message;
    return {
      invalid: true,
      valid: false,
      message: `No se pudo obtener el turno asignado${message ? `: ${message}` : ""}`,
    };
  } else if (statusCode.startsWith(2)) {
    // Success path
    const {
      user: userData,
      assignments: { shift_details: details, experience, shift_id: id },
    } = response.data;

    const shift = new Shift({ ...details, id, experience });
    const user = new User(userData);
    return { valid: true, fetched: true, shift, user };
  }

  // Unexpected error
  return { invalid: false, valid: false };
}

async function getShift(token: string): Promise<ShiftValidation> {
  const cached = fetchTokenCache(token);
  let shift, user;

  // Check cache
  if (cached && !cached.fresh) {
    console.log("Cache caducado");
    cache.del(token);
  } else if (cached) {
    // Cache is fresh, but token can be valid or not
    if (!cached.valid) return { valid: false, message: "Token inválido" };

    console.log("Cache encontrado");
    shift = new Shift(cached.shift!);
    user = cached.user ? new User(cached.user) : undefined;

    if (!shift.isOpen) {
      return { valid: false, message: "No hay turnos disponibles" };
    }
  }

  let validation: ShiftValidation | null = null;
  if (!shift) {
    // No data in cache, let's fetch it
    console.log("Validating with LabRem API");
    validation = await fetchShift(token);
  }

  // Success return
  return { valid: true, shift, user, ...validation };
}

async function validateToken(token: string | undefined): Promise<TokenValidation> {
  if (!token) return { valid: false, message: "Necesita loguearse" };

  // TODO: Redirect
  if (expiredToken(token)) return { valid: false, message: "Experiencia finalizada" };

  const { shift, user, ...shiftValidation } = await getShift(token);

  if (shiftValidation.invalid || !shift) {
    if (shiftValidation.invalid) {
      console.log("Token invalidado");
      setInvalidCache(token);
    }
    return { valid: false, message: shiftValidation.message || "Error al validar el token" };
  }

  if (!shiftValidation.valid) {
    console.log("El token no se pudo verificar");
    return { valid: false, message: "Error de autenticación, vuelva a intentar" };
  }

  setTokenCache(token, { shift: shift.toJSON(), user: user?.toJSON(), fetched: !!shiftValidation.fetched });

  if (shift.isOpen) {
    return { valid: true, shift };
  } else {
    const msUntilOpen = new Date(`${shift.day}T${shift.startTime}`).getTime() - Date.now();
    const name = encodeURIComponent(shift.experience.name);
    const redirectTo = `/proxy/espera?name=${name}&redirectIn=${msUntilOpen}`;
    return { valid: true, redirectTo };
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  if (req.target?.test) return next();

  const token = extractToken(req);
  const validation = await validateToken(token);

  if (!validation.valid) {
    return res.status(401).json({
      error: "Unauthorized",
      message: validation.message,
    });
  }

  if (validation.redirectTo) {
    return res.redirect(validation.redirectTo);
  }

  setTokenCookie(token!, res);

  next();
}
