import config from "./config.ts";
import { markRebooted, pendingRebootsDue, prunePendingReboots } from "./pendingReboots.ts";
import { triggerReboot } from "./reboot.ts";

let timer: NodeJS.Timeout | null = null;

export function sweepPendingReboots(now: number = Date.now()): number {
  const due = pendingRebootsDue(now);

  for (const { shiftId, experienceId } of due) {
    console.log(`[reboot] shift ${shiftId} expired — rebooting experience ${experienceId}`);
    triggerReboot(experienceId);
    markRebooted(shiftId, now);
  }

  prunePendingReboots(now);

  return due.length;
}

export function startRebootSweeper(): void {
  if (timer) return;

  sweepPendingReboots();

  timer = setInterval(() => sweepPendingReboots(), config.rebootSweepIntervalMs);
}

export function stopRebootSweeper(): void {
  if (!timer) return;

  clearInterval(timer);
  timer = null;
}
