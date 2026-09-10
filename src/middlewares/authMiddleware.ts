import "../types/express.ts";
import { Request, Response, NextFunction } from "express";
import axios from "axios";
import { cache, fetchTokenCache, setInvalidCache, setTokenCache } from "../auth/cache.ts";
import config from "../config.ts";
import { Shift } from "../../client/src/models/Shift.ts";
import { User } from "../../client/src/models/User.ts";
import { expiredToken, getTokenDuration } from "../auth/jwt.ts";
import { extractToken, setTokenCookie, isTopLevelNavigation } from "./utils.ts";
import { triggerReboot } from "../reboot.ts";

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
    const user = userData ? new User(userData) : undefined;
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

// The expired-token branch in validateToken() only reboots the lab once a
// request carrying that expired token actually reaches us — a student who
// closes the tab before their shift ends stops sending requests entirely, so
// that branch never runs and the hardware is left in whatever state they
// left it. This schedules the reboot against the token's own wall-clock
// expiry instead, so it fires even with no further requests. Runs once per
// token (guarded by rebootScheduled in cache) even though this is called on
// every request for an open shift, since polling re-enters this path often.
function scheduleRebootAtExpiry(token: string, experienceId: string | undefined): void {
  const cached = fetchTokenCache(token);
  if (cached?.rebootScheduled) return;

  const delayMs = getTokenDuration(token) * 1000;
  if (!delayMs || delayMs <= 0) return;

  // Snapshot now and carry it into the timer closure: the only thing this
  // timer does is flip rebootTriggered once it fires, and it's the sole
  // timer for this token (guarded by rebootScheduled above), so there's no
  // need to re-read the cache at fire time.
  const scheduledEntry = { ...cached, rebootScheduled: true };
  setTokenCache(token, scheduledEntry);

  setTimeout(() => {
    triggerReboot(experienceId);
    setTokenCache(token, { ...scheduledEntry, rebootTriggered: true });
  }, delayMs);
}

async function validateToken(token: string | undefined, req: Request): Promise<TokenValidation> {
  if (!token) return { valid: false, message: "Necesita loguearse" };

  if (expiredToken(token)) {
    const cached = fetchTokenCache(token);
    const experience = cached?.shift?.experience;

    // Reboot the physical lab hardware exactly once per shift, the first time
    // we observe the expired token (regardless of whether this request is a
    // background poll or a page navigation).
    if (cached && !cached.rebootTriggered) {
      triggerReboot(experience?.id);
      setTokenCache(token, { ...cached, rebootTriggered: true });
    }

    if (isTopLevelNavigation(req) && experience?.name) {
      const name = encodeURIComponent(experience.name);
      return { valid: true, redirectTo: `/proxy/espera?name=${name}&reason=finalizado` };
    }

    return { valid: false, message: "Experiencia finalizada" };
  }

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
    scheduleRebootAtExpiry(token, shift.experience?.id);
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
  const validation = await validateToken(token, req);

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
