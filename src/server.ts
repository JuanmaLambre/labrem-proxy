import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { app } from "./app.ts";
import { default as config } from "./config.ts";
import { getTargets } from "./targets.ts";

// Start server
function startServer() {
  let server;

  server = http.createServer(app);
  console.log("HTTP mode (HTTPS disabled)");

  server.listen(config.port, () => {
    console.log("=".repeat(60));
    console.log("Labrem Proxy Server Started");
    console.log("=".repeat(60));
    console.log(`Port: ${config.port}`);
    console.log(`Available Targets: ${Object.keys(getTargets()).join(", ")}`);
    console.log(`Authentication URL: ${config.authenticationUrl || "NOT CONFIGURED"}`);
    console.log("=".repeat(60));
  });
}

// Validate configuration
if (!config.authenticationUrl) {
  console.warn("WARNING: OAUTH_VALIDATION_URL not configured. Set it in .env file");
}

startServer();
