require("dotenv").config();
import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import helmet from "helmet";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { default as config } from "./config.ts";
import targetServers from "./targets.json";
import { targetMiddleware } from "./middlewares/targetMiddleware.ts";
import { authMiddleware } from "./middlewares/authMiddleware.ts";
import { proxyMiddleware } from "./middlewares/proxyMiddleware.ts";
import { corsMiddleware } from "./middlewares/corsMiddleware.ts";

// Initialize Express app
const app = express();

// Middlewares
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP for proxy
  }),
);
app.use(morgan(process.env.LOG_LEVEL || "combined"));
app.use(cookieParser());
app.use(corsMiddleware);

// Health check endpoint (no auth required)
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    targets: targetServers,
    app: "LabRem proxy",
  });
});

// Serve static files from the dist directory (CSS, JS, images)
const distPath = path.join(__dirname, "../dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  console.log("Serving static files from:", distPath);
}

// Serve specific HTML files for different routes
if (fs.existsSync(distPath)) {
  app.get("/login", (req, res) => {
    res.sendFile(path.join(distPath, "src/pages/login.html"));
  });
}

// Proxy middleware for all other routes (must be last)
app.use("*", targetMiddleware, authMiddleware, proxyMiddleware);

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
    console.log(`Available Targets: ${Object.keys(targetServers).join(", ")}`);
    console.log(`Authentication URL: ${config.authenticationUrl || "NOT CONFIGURED"}`);
    console.log(`Cache TTL: ${config.cacheTtl} seconds`);
    console.log("=".repeat(60));
  });
}

// Validate configuration
if (!config.authenticationUrl) {
  console.warn("WARNING: OAUTH_VALIDATION_URL not configured. Set it in .env file");
}

startServer();
