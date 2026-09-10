require("dotenv").config();

const config = {
  port: parseInt(process.env.PORT || "3000"),
  authenticationUrl: process.env.AUTHENTICATION_URL || "https://laboratorios-remotos-test.fi.uba.ar",
  targetsFilepath: process.env.TARGETS_CONFIG || "targets.json",
  rebootTargetsFilepath: process.env.REBOOT_TARGETS_CONFIG || "rebootTargets.json",
  rebootSecret: process.env.REBOOT_SECRET,
  upstreamProxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY,
  testProxyEnabled: process.env.TEST_PROXY_ENABLED === "true",
} as const;

export default config;
