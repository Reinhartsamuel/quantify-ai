import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@quantify/config": `${root}packages/config/src/index.ts`,
      "@quantify/contracts": `${root}packages/contracts/src/index.ts`,
      "@quantify/strategy-spec": `${root}packages/strategy-spec/src/index.ts`,
      "@quantify/indicators": `${root}packages/indicators/src/index.ts`,
      "@quantify/strategy-compiler": `${root}packages/strategy-compiler/src/index.ts`,
      "@quantify/backtest-engine": `${root}packages/backtest-engine/src/index.ts`,
      "@quantify/backtest-runner": `${root}packages/backtest-runner/src/index.ts`,
      "@quantify/performance": `${root}packages/performance/src/index.ts`,
      "@quantify/market-data": `${root}packages/market-data/src/index.ts`,
      "@quantify/ai": `${root}packages/ai/src/index.ts`,
      "@quantify/db": `${root}packages/db/src/index.ts`,
      "@quantify/auth": `${root}packages/auth/src/index.ts`,
    },
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
