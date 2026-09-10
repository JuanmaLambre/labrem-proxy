import fs from "fs";
import path from "path";
import os from "os";

// Each test gets its own store file, and modules are reset so config.ts picks
// up the new PENDING_REBOOTS_FILE. Re-importing after a reset is also how we
// simulate the pm2 restart this store exists to survive.
let tmpDir: string;
let storeFile: string;

async function loadStore() {
  return await import("../src/pendingReboots.ts");
}

function readStoreFile(): Record<string, any> {
  return JSON.parse(fs.readFileSync(storeFile, "utf-8"));
}

beforeEach(() => {
  jest.resetModules();

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pending-reboots-test-"));
  storeFile = path.join(tmpDir, "pendingReboots.json");
  process.env.PENDING_REBOOTS_FILE = storeFile;
});

afterEach(() => {
  delete process.env.PENDING_REBOOTS_FILE;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("schedulePendingReboot", () => {
  it("records the reboot and persists it to disk", async () => {
    const { schedulePendingReboot, allPendingReboots } = await loadStore();

    const scheduled = schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_800_000_000_000 });

    expect(scheduled).toBe(true);
    expect(allPendingReboots()).toEqual([
      { shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_800_000_000_000 },
    ]);
    expect(readStoreFile()).toEqual({
      "shift-1": { experienceId: "exp-1", expiresAt: 1_800_000_000_000 },
    });
  });

  it("is a no-op when the same shift is scheduled again with the same expiry", async () => {
    const { schedulePendingReboot, allPendingReboots } = await loadStore();
    schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_800_000_000_000 });

    // The polling case: every request of an open shift carries the same expiry.
    const rescheduled = schedulePendingReboot({
      shiftId: "shift-1",
      experienceId: "exp-1",
      expiresAt: 1_800_000_000_000,
    });

    expect(rescheduled).toBe(false);
    expect(allPendingReboots()).toHaveLength(1);
  });

  it("keeps the later deadline when an earlier expiry arrives", async () => {
    const { schedulePendingReboot, allPendingReboots } = await loadStore();
    schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 5_000 });

    // Clock skew or a shorter token must not pull the reboot into a session
    // that is still running.
    expect(schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 3_000 })).toBe(false);
    expect(allPendingReboots()[0].expiresAt).toBe(5_000);
  });

  it("re-arms a pending reboot when a later expiry arrives", async () => {
    const { schedulePendingReboot, allPendingReboots } = await loadStore();
    schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 5_000 });

    // The student logged back in mid-shift and got a token expiring later.
    expect(schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 9_000 })).toBe(true);
    expect(allPendingReboots()).toEqual([{ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 9_000 }]);
  });

  it("re-arms a shift whose reboot already fired when a later expiry arrives", async () => {
    const { schedulePendingReboot, markRebooted, pendingRebootsDue, allPendingReboots } = await loadStore();
    schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 5_000 });
    markRebooted("shift-1", 5_100);

    // A tombstone must not suppress a reboot that is genuinely owed: this is
    // the second session of the same shift, and its hardware needs the reboot.
    expect(schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 9_000 })).toBe(true);
    expect(allPendingReboots()).toEqual([{ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 9_000 }]);
    expect(pendingRebootsDue(9_000)).toHaveLength(1);
  });

  it("ignores records with a missing id or an invalid expiry", async () => {
    const { schedulePendingReboot, allPendingReboots } = await loadStore();

    expect(schedulePendingReboot({ shiftId: "", experienceId: "exp-1", expiresAt: 1_000 })).toBe(false);
    expect(schedulePendingReboot({ shiftId: "shift-1", experienceId: "", expiresAt: 1_000 })).toBe(false);
    expect(schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: NaN })).toBe(false);
    expect(schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: Infinity })).toBe(false);
    expect(schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 0 })).toBe(false);
    expect(schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: -1_000 })).toBe(false);
    expect(allPendingReboots()).toEqual([]);
  });

  it("strips unknown fields instead of persisting them", async () => {
    const { schedulePendingReboot } = await loadStore();

    schedulePendingReboot({
      shiftId: "shift-1",
      experienceId: "exp-1",
      expiresAt: 1_000,
      token: "should-not-be-written",
    } as any);

    expect(readStoreFile()["shift-1"]).toEqual({ experienceId: "exp-1", expiresAt: 1_000 });
  });

  it("leaves no temp file behind after writing", async () => {
    const { schedulePendingReboot } = await loadStore();

    schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_000 });

    expect(fs.readdirSync(tmpDir)).toEqual(["pendingReboots.json"]);
  });
});

describe("pendingRebootsDue", () => {
  it("returns only reboots whose expiry has passed", async () => {
    const { schedulePendingReboot, pendingRebootsDue } = await loadStore();
    schedulePendingReboot({ shiftId: "past", experienceId: "exp-1", expiresAt: 1_000 });
    schedulePendingReboot({ shiftId: "future", experienceId: "exp-2", expiresAt: 9_000 });

    const due = pendingRebootsDue(5_000);

    expect(due).toEqual([{ shiftId: "past", experienceId: "exp-1", expiresAt: 1_000 }]);
  });

  it("treats an expiry exactly at now as due", async () => {
    const { schedulePendingReboot, pendingRebootsDue } = await loadStore();
    schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 5_000 });

    expect(pendingRebootsDue(5_000)).toHaveLength(1);
  });

  it("excludes reboots that were already fired", async () => {
    const { schedulePendingReboot, markRebooted, pendingRebootsDue } = await loadStore();
    schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_000 });
    markRebooted("shift-1", 2_000);

    expect(pendingRebootsDue(5_000)).toEqual([]);
  });

  it("still reports a reboot that came due while the process was down", async () => {
    const first = await loadStore();
    first.schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_000 });

    // Simulate the pm2 restart: fresh module registry, same store file.
    jest.resetModules();
    const afterRestart = await loadStore();

    expect(afterRestart.pendingRebootsDue(5_000)).toEqual([
      { shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_000 },
    ]);
  });
});

describe("markRebooted", () => {
  it("records when the reboot was fired and survives a restart", async () => {
    const first = await loadStore();
    first.schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_000 });
    first.markRebooted("shift-1", 2_000);

    jest.resetModules();
    const afterRestart = await loadStore();

    expect(afterRestart.allPendingReboots()).toEqual([
      { shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_000, rebootedAt: 2_000 },
    ]);
  });

  it("keeps the first timestamp when called twice", async () => {
    const { schedulePendingReboot, markRebooted, allPendingReboots } = await loadStore();
    schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_000 });

    markRebooted("shift-1", 2_000);
    markRebooted("shift-1", 3_000);

    expect(allPendingReboots()[0].rebootedAt).toBe(2_000);
  });

  it("does nothing for an unknown shift", async () => {
    const { markRebooted, allPendingReboots } = await loadStore();

    expect(() => markRebooted("nope")).not.toThrow();
    expect(allPendingReboots()).toEqual([]);
  });
});

describe("prunePendingReboots", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  it("drops tombstones past the retention window and keeps recent ones", async () => {
    const { schedulePendingReboot, markRebooted, prunePendingReboots, allPendingReboots } = await loadStore();
    schedulePendingReboot({ shiftId: "old", experienceId: "exp-1", expiresAt: 1_000 });
    schedulePendingReboot({ shiftId: "recent", experienceId: "exp-2", expiresAt: 1_000 });
    markRebooted("old", 10 * DAY_MS);
    markRebooted("recent", 11 * DAY_MS);

    const pruned = prunePendingReboots(11 * DAY_MS + 1_000);

    expect(pruned).toBe(1);
    expect(allPendingReboots().map((r) => r.shiftId)).toEqual(["recent"]);
    expect(Object.keys(readStoreFile())).toEqual(["recent"]);
  });

  it("never drops a reboot that has not fired yet, however old", async () => {
    const { schedulePendingReboot, prunePendingReboots, allPendingReboots } = await loadStore();
    schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_000 });

    expect(prunePendingReboots(100 * DAY_MS)).toBe(0);
    expect(allPendingReboots()).toHaveLength(1);
  });
});

describe("concurrent requests", () => {
  // Mirrors authMiddleware: each request awaits the auth API and only then
  // schedules. The awaits interleave the handlers; the schedule call itself
  // is synchronous, so it must not interleave.
  async function request(schedule: () => void): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
    schedule();
  }

  it("keeps every record when many requests schedule different shifts at once", async () => {
    const { schedulePendingReboot, allPendingReboots } = await loadStore();

    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        request(() =>
          schedulePendingReboot({ shiftId: `shift-${i}`, experienceId: `exp-${i}`, expiresAt: 1_000 + i }),
        ),
      ),
    );

    expect(allPendingReboots()).toHaveLength(50);
    expect(Object.keys(readStoreFile())).toHaveLength(50);
  });

  it("schedules a shared shift exactly once when its requests race", async () => {
    const { schedulePendingReboot, allPendingReboots } = await loadStore();
    const scheduled: boolean[] = [];

    // The polling case: many concurrent requests of the same open shift.
    await Promise.all(
      Array.from({ length: 50 }, () =>
        request(() => {
          scheduled.push(schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_000 }));
        }),
      ),
    );

    expect(scheduled.filter(Boolean)).toHaveLength(1);
    expect(allPendingReboots()).toHaveLength(1);
  });
});

describe("reading a damaged or missing store", () => {
  it("starts empty when the file does not exist", async () => {
    const { allPendingReboots } = await loadStore();

    expect(allPendingReboots()).toEqual([]);
  });

  it("starts empty when the file is not valid JSON", async () => {
    // A truncated write from a hard kill: must not crash the boot.
    fs.writeFileSync(storeFile, '{"shift-1": {"experienceId": "exp-1"');
    const { allPendingReboots } = await loadStore();

    expect(allPendingReboots()).toEqual([]);
  });

  it("discards malformed records but keeps the valid ones", async () => {
    fs.writeFileSync(
      storeFile,
      JSON.stringify({
        good: { experienceId: "exp-1", expiresAt: 1_000 },
        "no-experience": { expiresAt: 1_000 },
        "bad-expiry": { experienceId: "exp-2", expiresAt: "soon" },
        "not-an-object": 42,
      }),
    );
    const { allPendingReboots } = await loadStore();

    expect(allPendingReboots()).toEqual([{ shiftId: "good", experienceId: "exp-1", expiresAt: 1_000 }]);
  });
});
