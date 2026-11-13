import { serve } from "@hono/node-server";
import { createDependencies } from "./bootstrap.js";

const dependencies = await createDependencies();
const port = dependencies.env.PORT;

const server = serve(
  {
    fetch: dependencies.app.fetch,
    port,
  },
  (info) => {
    console.log(
      JSON.stringify({
        level: "info",
        type: "startup",
        message: "API listening",
        port: info.port,
        marketDataMode: dependencies.env.MARKET_DATA_MODE,
        aiMode: dependencies.env.AI_MODE,
      }),
    );
  },
);

async function shutdown(signal: string): Promise<void> {
  console.log(JSON.stringify({ level: "info", type: "shutdown", signal }));
  server.close();
  await dependencies.client.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
