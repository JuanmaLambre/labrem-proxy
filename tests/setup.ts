import fs from "fs";
import os from "os";
import path from "path";

process.env.TARGETS_CONFIG = "tests/fixtures/targets.json";

process.env.PENDING_REBOOTS_FILE = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "labrem-test-")),
  "pendingReboots.json",
);
