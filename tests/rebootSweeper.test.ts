import fs from "fs";
import path from "path";
import os from "os";

jest.mock("../src/reboot.ts");

// Exercises the sweeper against the real on-disk store, mocking only the
// outbound reboot call: the interaction between the two is the whole point.
let tmpDir: string;
let storeFile: string;

async function loadSweeper() {
  const reboot = await import("../src/reboot.ts");
  const store = await import("../src/pendingReboots.ts");
  const sweeper = await import("../src/rebootSweeper.ts");

  return { triggerReboot: reboot.triggerReboot as jest.Mock, store, sweeper };
}

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reboot-sweeper-test-"));
  storeFile = path.join(tmpDir, "pendingReboots.json");
  process.env.PENDING_REBOOTS_FILE = storeFile;
  process.env.REBOOT_SWEEP_INTERVAL_MS = "1000";
});

afterEach(() => {
  delete process.env.PENDING_REBOOTS_FILE;
  delete process.env.REBOOT_SWEEP_INTERVAL_MS;
  jest.useRealTimers();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("sweepPendingReboots", () => {
  it("reboots every experience whose shift has expired", async () => {
    const { triggerReboot, store, sweeper } = await loadSweeper();
    store.schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_000 });
    store.schedulePendingReboot({ shiftId: "shift-2", experienceId: "exp-2", expiresAt: 2_000 });

    const swept = sweeper.sweepPendingReboots(5_000);

    expect(swept).toBe(2);
    expect(triggerReboot.mock.calls.map(([id]) => id).sort()).toEqual(["exp-1", "exp-2"]);
  });

  it("leaves a shift alone until its expiry passes", async () => {
    const { triggerReboot, store, sweeper } = await loadSweeper();
    store.schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 9_000 });

    expect(sweeper.sweepPendingReboots(5_000)).toBe(0);
    expect(triggerReboot).not.toHaveBeenCalled();

    expect(sweeper.sweepPendingReboots(9_000)).toBe(1);
    expect(triggerReboot).toHaveBeenCalledWith("exp-1");
  });

  it("does not reboot the same shift twice across sweeps", async () => {
    const { triggerReboot, store, sweeper } = await loadSweeper();
    store.schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_000 });

    sweeper.sweepPendingReboots(5_000);
    sweeper.sweepPendingReboots(6_000);
    sweeper.sweepPendingReboots(7_000);

    expect(triggerReboot).toHaveBeenCalledTimes(1);
  });

  it("marks the reboot as attempted even though triggerReboot reports nothing", async () => {
    const { store, sweeper } = await loadSweeper();
    store.schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_000 });

    sweeper.sweepPendingReboots(5_000);

    // triggerReboot is fire-and-forget and retries nothing, so rebootedAt
    // records the attempt — otherwise every sweep would retry forever.
    expect(store.allPendingReboots()).toEqual([
      { shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_000, rebootedAt: 5_000 },
    ]);
    expect(store.pendingRebootsDue(9_000)).toEqual([]);
  });

  it("fires a reboot that came due while the process was down", async () => {
    const first = await loadSweeper();
    first.store.schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_000 });

    // Simulate the pm2 restart: fresh module registry, same store file.
    jest.resetModules();
    const { triggerReboot, sweeper } = await loadSweeper();

    sweeper.sweepPendingReboots(5_000);

    expect(triggerReboot).toHaveBeenCalledWith("exp-1");
  });

  it("reboots again when a re-login extended the shift past a fired reboot", async () => {
    const { triggerReboot, store, sweeper } = await loadSweeper();
    store.schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_000 });
    sweeper.sweepPendingReboots(1_000);

    // Second session of the same shift, with a token expiring later.
    store.schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 8_000 });
    sweeper.sweepPendingReboots(8_000);

    expect(triggerReboot).toHaveBeenCalledTimes(2);
  });

  it("prunes tombstones past the retention window", async () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const { store, sweeper } = await loadSweeper();
    store.schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: 1_000 });

    sweeper.sweepPendingReboots(2_000);
    expect(store.allPendingReboots()).toHaveLength(1);

    sweeper.sweepPendingReboots(2_000 + DAY_MS + 1);
    expect(store.allPendingReboots()).toEqual([]);
  });
});

describe("startRebootSweeper", () => {
  it("sweeps immediately at boot and then on every interval", async () => {
    jest.useFakeTimers();
    const { triggerReboot, store, sweeper } = await loadSweeper();
    store.schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: Date.now() - 1 });

    sweeper.startRebootSweeper();
    expect(triggerReboot).toHaveBeenCalledTimes(1);

    // A shift that comes due later is picked up by a subsequent tick.
    store.schedulePendingReboot({ shiftId: "shift-2", experienceId: "exp-2", expiresAt: Date.now() + 500 });
    jest.advanceTimersByTime(1_000);

    expect(triggerReboot).toHaveBeenCalledTimes(2);
    expect(triggerReboot).toHaveBeenLastCalledWith("exp-2");

    sweeper.stopRebootSweeper();
  });

  it("does not start a second interval when called twice", async () => {
    jest.useFakeTimers();
    const { triggerReboot, store, sweeper } = await loadSweeper();

    sweeper.startRebootSweeper();
    sweeper.startRebootSweeper();

    store.schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: Date.now() + 500 });
    jest.advanceTimersByTime(1_000);

    expect(triggerReboot).toHaveBeenCalledTimes(1);

    sweeper.stopRebootSweeper();
  });

  it("stops sweeping once stopped", async () => {
    jest.useFakeTimers();
    const { triggerReboot, store, sweeper } = await loadSweeper();

    sweeper.startRebootSweeper();
    sweeper.stopRebootSweeper();

    store.schedulePendingReboot({ shiftId: "shift-1", experienceId: "exp-1", expiresAt: Date.now() + 500 });
    jest.advanceTimersByTime(10_000);

    expect(triggerReboot).not.toHaveBeenCalled();
  });
});
