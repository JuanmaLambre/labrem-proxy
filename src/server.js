require("dotenv").config();
const express = require("express");
const NodeCache = require("node-cache");
const axios = require("axios");
const morgan = require("morgan");
const helmet = require("helmet");
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const targetServers = require("./targets.json");
const { targetMiddleware } = require("./middlewares/targetMiddleware");
const { authMiddleware } = require("./middlewares/authMiddleware");
const { proxyMiddleware } = require("./middlewares/proxyMiddleware");
const { corsMiddleware } = require("./middlewares/corsMiddleware");
const { default: config } = require("./config");

// Initialize Express app
const app = express();

// Middlewares
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP for proxy
  }),
);
app.use(morgan(process.env.LOG_LEVEL || "combined"));
app.use(corsMiddleware);

// Proxy middleware for /api routes
app.use("/api", authMiddleware, targetMiddleware, proxyMiddleware);

// Health check endpoint (no auth required)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    targets: targetServers,
    app: "LabRem proxy",
  });
});

// Serve React app for all other routes (must be last)
if (fs.existsSync(distPath)) {
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

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
    console.log(`Target Query Param: ?${config.targetQueryParam}=<key>`);
    console.log(`Default Target: [${config.defaultTarget}] ${targetServers[config.defaultTarget]}`);
    console.log(`Available Targets: ${Object.keys(targetServers).join(", ")}`);
    console.log(`OAuth Validation URL: ${config.oauthValidationUrl || "NOT CONFIGURED"}`);
    console.log(`Cache TTL: ${config.cacheTtl} seconds`);
    console.log("=".repeat(60));
  });
}

// Validate configuration
if (!config.oauthValidationUrl) {
  console.warn("WARNING: OAUTH_VALIDATION_URL not configured. Set it in .env file");
}

startServer();
