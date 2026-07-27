import fs from "fs";
import path from "path";
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import config from "./config";

function loadRebootTargets(): Record<string, string> {
  try {
    const filepath = path.resolve(config.rebootTargetsFilepath);
    return JSON.parse(fs.readFileSync(filepath, "utf-8"));
  } catch {
    // No rebootTargets.json configured — reboot-on-expiry is opt-in per experience.
    return {};
  }
}

const rebootTargets = loadRebootTargets();

// Same forward-proxy setup proxyMiddleware already uses: the lab machines are
// on a network segment gwlabremotos can only reach through proxy.fi.uba.ar,
// same as it reaches the target experience itself.
const upstreamProxy = config.upstreamProxy ? new HttpsProxyAgent(config.upstreamProxy) : undefined;

// Fire-and-forget: reboots the physical lab machine tied to `experienceId`, if
// configured, via a small authenticated endpoint on the lab machine itself
// (there is no direct network route from this server to the lab's private
// IP for SSH — only through the same proxied HTTP path used to serve the
// experience). Never throws — a failure here must not affect the response
// to the student's browser.
export function triggerReboot(experienceId: string | undefined): void {
  if (!experienceId) return;

  const url = rebootTargets[experienceId];
  if (!url) return;

  if (!config.rebootSecret) {
    console.error(`[reboot] REBOOT_SECRET is not configured — skipping reboot for ${experienceId}`);
    return;
  }

  axios
    .post(url, null, {
      headers: { "X-Reboot-Secret": config.rebootSecret },
      timeout: 5000,
      proxy: false,
      ...(upstreamProxy && { httpAgent: upstreamProxy, httpsAgent: upstreamProxy }),
    })
    .catch((err) => {
      console.error(`[reboot] request failed for ${experienceId}:`, err.message);
    });
}
