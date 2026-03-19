import { Request, Response } from "express";
import { createProxyMiddleware, Options } from "http-proxy-middleware";
import { IncomingMessage } from "http";
import config from "../config.ts";
import "../types/express.ts";

const rewriteLocationHeader = (proxyRes: IncomingMessage, req: Request): void => {
  // Rewrite Location headers in redirect responses to prevent browser from navigating away
  const location = proxyRes.headers["location"];
  if (location) {
    const targetUrl = req.target!.url!;
    const locationUrl = new URL(location, targetUrl);
    const targetUrlObj = new URL(targetUrl);

    // If the location is pointing to the target server, rewrite it to point to the proxy
    if (
      locationUrl.hostname === targetUrlObj.hostname &&
      locationUrl.port === targetUrlObj.port &&
      locationUrl.protocol === targetUrlObj.protocol
    ) {
      // Build the proxy URL
      const proxyProtocol = req.protocol || "http";
      const proxyHost = req.get("host") || `localhost:${config.port}`;
      const newLocation = `${proxyProtocol}://${proxyHost}${locationUrl.pathname}${locationUrl.search}${locationUrl.hash}`;

      proxyRes.headers["location"] = newLocation;
      console.log(`Rewrote Location header from ${location} to ${newLocation}`);
    }
  }
};

// Proxy middleware configuration with dynamic target routing
const proxyOptions: Options = {
  router: (req: Request) => req.target!.url,
  changeOrigin: true,
  ws: true, // Proxy websockets
  onProxyRes: rewriteLocationHeader,
  onError: (err: Error, req: Request, res: Response) => {
    const targetKey = req.target!.key;
    console.error(`Proxy error for target [${targetKey}]:`, err.message);
    res.status(502).json({
      error: "Bad Gateway",
      message: "Error connecting to target service",
      target: targetKey,
    });
  },
};

export const proxyMiddleware = createProxyMiddleware(proxyOptions);
