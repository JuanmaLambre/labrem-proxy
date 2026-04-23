module.exports = {
  apps: [
    {
      name: "labrem-proxy",
      script: "src/server.ts",
      interpreter: "node_modules/.bin/tsx",
      restart_delay: 2000,
      max_restarts: 10,
      env_file: ".env",
    },
  ],
};
