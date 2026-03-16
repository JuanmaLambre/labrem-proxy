import axios from "axios";
import { cache, fetchTokenCache, setInvalidCache, setTokenCache } from "../auth/cache.js";
import config from "../config.js";
import { Shift } from "../../client/src/models/Shift.js";

const TOKEN_COOKIE_NAME = "labrem_token";

function extractToken(req) {
  return req.cookies?.[TOKEN_COOKIE_NAME];
}

async function fetchShifts(token) {
  const response = await axios
    .get(`${config.authenticationUrl}/api/v1/shifts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .catch((err) => {
      console.error("Error fetching shifts from LabRem API:", err.message);
      return { status: err.response?.status || 500 };
    });

  if (response.status !== 200) {
    return { valid: false, message: "No se pudieron obtener los turnos asignados" };
  }

  return { valid: true, shifts: response.data };
}

function getActiveShift(shifts, experienceId) {
  return shifts.find((s) => s.isOpen && s.experienceId === experienceId);
}

async function validateToken(token, experienceId) {
  return { valid: true };

  if (!token) return { valid: false, message: "Necesita loguearse" };

  const cached = fetchTokenCache(token);
  if (cached) {
    if (!cached.valid) return { valid: false, reason: "Token inválido" };

    const shifts = Shift.hydrateAll(cached.shifts);
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
  const shifts = Shift.hydrateAll(shiftsValidation.shifts);
  const activeShift = getActiveShift(shifts, experienceId);

  if (activeShift) {
    return { valid: true };
  } else {
    return { valid: false, message: "No hay turnos disponibles" };
  }
}

export async function authMiddleware(req, res, next) {
  const token = extractToken(req);
  const validation = await validateToken(token, req.targetServer.key);

  if (!validation.valid) {
    return res.status(401).json({
      error: "Unauthorized",
      message: validation.message,
    });
  }

  next();
}
