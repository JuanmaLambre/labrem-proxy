const config = {
  port: parseInt(process.env.PORT || "3456"),
  authenticationUrl: process.env.AUTHENTICATION_URL || "https://laboratorios-remotos-test.fi.uba.ar",
  httpsEnabled: process.env.HTTPS_ENABLED === "true",
  sslKeyPath: process.env.SSL_KEY_PATH,
  sslCertPath: process.env.SSL_CERT_PATH,
  targetsConfig: process.env.TARGETS_CONFIG || "targets.json",
} as const;

export default config;
