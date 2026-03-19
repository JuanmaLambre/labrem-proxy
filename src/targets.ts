import fs from "fs";
import path from "path";
import config from "./config";

const targetsPath = path.resolve(config.targetsFilepath);

let targets: Record<string, string> = JSON.parse(fs.readFileSync(targetsPath, "utf-8"));

fs.watch(targetsPath, () => {
  try {
    targets = JSON.parse(fs.readFileSync(targetsPath, "utf-8"));
    console.log("targets.json reloaded:", targets);
  } catch (err) {
    console.error("Failed to reload targets.json — keeping previous config:", err);
  }
});

export function getTargets(): Record<string, string> {
  return targets;
}
