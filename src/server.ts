require("dotenv").config();
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

  if (config.httpsEnabled) {
    // HTTPS server
    if (!config.sslKeyPath || !config.sslCertPath) {
      console.error("HTTPS enabled but SSL_KEY_PATH or SSL_CERT_PATH not configured");
      process.exit(1);
    }

    const keyPath = path.resolve(config.sslKeyPath);
    const certPath = path.resolve(config.sslCertPath);

    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      console.error("SSL certificate files not found:", { keyPath, certPath });
      console.error(
        "Generate self-signed cert with: openssl req -nodes -new -x509 -keyout key.pem -out cert.pem -days 365",
      );
      process.exit(1);
    }

    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };

    server = https.createServer(httpsOptions, app);
    console.log("HTTPS enabled");
  } else {
    // HTTP server
    server = http.createServer(app);
    console.log("HTTP mode (HTTPS disabled)");
  }

  server.listen(config.port, () => {
    console.log("=".repeat(60));
    console.log("Labrem Proxy Server Started");
    console.log("=".repeat(60));
    console.log(`Protocol: ${config.httpsEnabled ? "HTTPS" : "HTTP"}`);
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
