// pm2 process definitions for the quantify demo on this VPS.
// Secrets stay in ./env at the repo root — Bun loads .env itself for the api/worker, so nothing
// sensitive belongs in this file (and avoid `pm2 describe`/`pm2 env`: they print the app env).
const ROOT = "/home/deploy/repos/quantify-ai";
const BUN = "/home/deploy/.bun/bin/bun";
const NODE = "/home/deploy/.nvm/versions/node/v26.13.1/bin/node";

module.exports = {
  apps: [
    {
      name: "quantify-api",
      cwd: ROOT,
      script: BUN,
      args: "apps/api/src/server.ts",
      interpreter: "none",
      env: { NODE_ENV: "production", APP_ENV: "production", PORT: "3001" },
      autorestart: true,
      kill_timeout: 10000,
      max_memory_restart: "600M",
      time: true,
    },
    {
      name: "quantify-worker",
      cwd: ROOT,
      script: BUN,
      args: "apps/worker/src/index.ts",
      interpreter: "none",
      env: { NODE_ENV: "production", APP_ENV: "production", WORKER_CONCURRENCY: "2" },
      autorestart: true,
      kill_timeout: 35000,
      max_memory_restart: "600M",
      time: true,
    },
    {
      name: "quantify-web",
      cwd: `${ROOT}/apps/web/.next/standalone`,
      script: NODE,
      args: "apps/web/server.js",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: "3005",
        HOSTNAME: "127.0.0.1",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      autorestart: true,
      kill_timeout: 10000,
      max_memory_restart: "600M",
      time: true,
    },
  ],
};
