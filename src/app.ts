import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import targetServers from "./targets.json" with { type: "json" };
import { authMiddleware } from "./middlewares/authMiddleware.ts";
import { proxyMiddleware } from "./middlewares/proxyMiddleware.ts";
import { corsMiddleware } from "./middlewares/corsMiddleware.ts";

// Initialize Express app
export const app = express();

// Middlewares
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP for proxy
  }),
);

app.use(cookieParser());
app.use(corsMiddleware);

// Health check endpoint (no auth required)
app.get("/health", (req, res) => {
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
  app.get("/proxy/espera", (_, res) => {
    res.sendFile(path.join(distPath, "src/pages/proxy/espera.html"));
  });

  app.get("/proxy/error", (_, res) => {
    res.sendFile(path.join(distPath, "src/pages/proxy/error.html"));
  });
}

// Proxy middleware for all other routes (must be last)
app.use("*", authMiddleware, proxyMiddleware);
