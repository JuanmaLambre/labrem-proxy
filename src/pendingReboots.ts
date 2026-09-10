import fs from "fs";
import path from "path";
import { z } from "zod";
import config from "./config.ts";

// One source of truth for the on-disk shape
const storedRebootSchema = z.object({
  experienceId: z.string().min(1),
  expiresAt: z.number().positive(), // ms epoch — when the shift's token expires
  rebootedAt: z.number().positive().optional(), // ms epoch — set once the reboot has actually been fired
});

const pendingRebootSchema = storedRebootSchema.extend({
  shiftId: z.string().min(1),
});

// The file as a whole is only checked to be an object of records
const storeFileSchema = z.record(z.string(), z.unknown());

type StoredReboot = z.infer<typeof storedRebootSchema>;
type Store = Record<string, StoredReboot>;

export type PendingReboot = z.infer<typeof pendingRebootSchema>;

const TOMBSTONE_RETENTION_MS = 24 * 60 * 60 * 1000;
const STORE_FILEPATH = path.resolve(config.pendingRebootsFilepath);

let store: Store | null = null;

function load(): Store {
  if (store) return store;

  const loaded: Store = {};
  store = loaded;

  let contents: unknown;
  try {
    contents = JSON.parse(fs.readFileSync(STORE_FILEPATH, "utf-8"));
  } catch (err: any) {
    // Missing file is the normal first-boot case; a truncated or hand-mangled
    // file means we lost state and should say so loudly, but we still have to
    // boot with a usable store.
    if (err?.code !== "ENOENT") {
      console.error("[pendingReboots] could not read store, starting empty:", err.message);
    }
    return loaded;
  }

  const file = storeFileSchema.safeParse(contents);
  if (!file.success) {
    console.error("[pendingReboots] store is not an object of records, starting empty");
    return loaded;
  }

  for (const [shiftId, value] of Object.entries(file.data)) {
    const record = storedRebootSchema.safeParse(value);
    if (record.success) {
      loaded[shiftId] = record.data;
    } else {
      console.error(
        `[pendingReboots] discarding malformed record for shift ${shiftId}:`,
        z.prettifyError(record.error),
      );
    }
  }

  return loaded;
}

// Write via temp file + rename so a restart mid-write can't leave a truncated JSON
function persist(): void {
  const filepath = STORE_FILEPATH;
  const tmpFilepath = `${filepath}.${process.pid}.tmp`;

  try {
    fs.writeFileSync(tmpFilepath, JSON.stringify(store, null, 2));
    fs.renameSync(tmpFilepath, filepath);
  } catch (err: any) {
    console.error("[pendingReboots] could not persist store:", err.message);
    // The rename may never have happened; don't leave the temp file around.
    try {
      fs.unlinkSync(tmpFilepath);
    } catch {
      // Nothing to clean up.
    }
  }
}

// MUST be sync to avoid concurrent writes from multiple request racing
export function schedulePendingReboot(reboot: PendingReboot): boolean {
  const parsed = pendingRebootSchema.safeParse(reboot);
  if (!parsed.success) {
    console.error("[pendingReboots] ignoring invalid reboot record:", z.prettifyError(parsed.error));
    return false;
  }

  const { shiftId, experienceId, expiresAt } = parsed.data;

  const current = load();
  const existing = current[shiftId];

  if (existing && existing.expiresAt >= expiresAt) return false;

  current[shiftId] = { experienceId, expiresAt };
  persist();

  return true;
}

// MUST be sync to avoid concurrent writes from multiple request racing
export function pendingRebootsDue(now: number = Date.now()): PendingReboot[] {
  return Object.entries(load())
    .filter(([, record]) => !record.rebootedAt && record.expiresAt <= now)
    .map(([shiftId, record]) => ({ shiftId, ...record }));
}

// MUST be sync to avoid concurrent writes from multiple request racing
export function markRebooted(shiftId: string, at: number = Date.now()): void {
  const current = load();
  const record = current[shiftId];
  if (!record || record.rebootedAt) return;

  current[shiftId] = { ...record, rebootedAt: at };
  persist();
}

// MUST be sync to avoid concurrent writes from multiple request racing
export function prunePendingReboots(now: number = Date.now()): number {
  const current = load();
  const stale = Object.entries(current).filter(
    ([, record]) => record.rebootedAt && now - record.rebootedAt > TOMBSTONE_RETENTION_MS,
  );

  if (!stale.length) return 0;

  for (const [shiftId] of stale) delete current[shiftId];
  persist();

  return stale.length;
}

export function allPendingReboots(): PendingReboot[] {
  return Object.entries(load()).map(([shiftId, record]) => ({ shiftId, ...record }));
}
