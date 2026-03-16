const config = {
  port: parseInt(process.env.PORT || "3456"),
  authenticationUrl: process.env.AUTHENTICATION_URL || "https://laboratorios-remotos-test.fi.uba.ar",
  cacheTtl: parseInt(process.env.CACHE_TTL_SECONDS || "300"),
  cacheCheckPeriod: parseInt(process.env.CACHE_CHECK_PERIOD_SECONDS || "60"),
  httpsEnabled: process.env.HTTPS_ENABLED === "true",
  sslKeyPath: process.env.SSL_KEY_PATH,
  sslCertPath: process.env.SSL_CERT_PATH,
} as const;

export default config;
