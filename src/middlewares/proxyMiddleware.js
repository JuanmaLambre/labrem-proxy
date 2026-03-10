import { createProxyMiddleware } from "http-proxy-middleware";

const rewriteLocationHeader = (proxyRes, req) => {
  // Rewrite Location headers in redirect responses to prevent browser from navigating away
  const location = proxyRes.headers["location"];
  if (location) {
    const targetUrl = req.targetServer ? req.targetServer.url : config.targetServers[config.defaultTarget];
    const targetKey = req.targetServer ? req.targetServer.key : config.defaultTarget;

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
      let newLocation = `${proxyProtocol}://${proxyHost}${locationUrl.pathname}${locationUrl.search}${locationUrl.hash}`;

      proxyRes.headers["location"] = newLocation;
      console.log(`Rewrote Location header from ${location} to ${newLocation}`);
    }
  }
};

// Proxy middleware configuration with dynamic target routing
const proxyOptions = {
  // Dynamic target routing based on query parameter
  router: (req) => {
    if (req.targetServer) {
      return req.targetServer.url;
    }
    // Fallback to default
    return config.targetServers[config.defaultTarget];
  },
  changeOrigin: true,
  ws: true, // Proxy websockets
  onProxyRes: rewriteLocationHeader,
  onError: (err, req, res) => {
    const targetKey = req.targetServer ? req.targetServer.key : config.defaultTarget;
    console.error(`Proxy error for target [${targetKey}]:`, err.message);
    res.status(502).json({
      error: "Bad Gateway",
      message: "Error connecting to target service",
      target: targetKey,
    });
  },
};

export const proxyMiddleware = createProxyMiddleware(proxyOptions);
