import { loadConfig } from "@quantify/config";
import { createPgliteClient, createPostgresClient, Store } from "@quantify/db";

const env = loadConfig();
const client =
  env.DB_DRIVER === "pglite"
    ? await createPgliteClient(env.PGLITE_PATH === ":memory:" ? undefined : env.PGLITE_PATH)
    : createPostgresClient(env.DATABASE_URL);
const store = new Store(client);
await store.migrate();
const rows = await client.query<{ version: string; applied_at: string }>(
  "SELECT version, applied_at FROM schema_migrations ORDER BY applied_at",
);
console.log(JSON.stringify({ migrated: true, driver: client.driver, versions: rows }, null, 2));
await client.close();
