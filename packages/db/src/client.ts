import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";

export type QueryRow = Record<string, unknown>;

export interface SqlClient {
  query<T extends QueryRow = QueryRow>(text: string, params?: readonly unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly driver: "postgres" | "pglite";
}

class PostgresClient implements SqlClient {
  readonly driver = "postgres" as const;
  constructor(private readonly sql: postgres.Sql) {}

  async query<T extends QueryRow = QueryRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    const rows = await this.sql.unsafe(text, params as never[]);
    return rows as unknown as T[];
  }

  async exec(text: string): Promise<void> {
    await this.sql.unsafe(text);
  }

  async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
    return this.sql.begin(async (transaction) => {
      const wrapped = new PostgresClient(transaction as unknown as postgres.Sql);
      return fn(wrapped);
    }) as Promise<T>;
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

type PgliteLike = {
  query<T extends QueryRow = QueryRow>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(text: string): Promise<unknown>;
};

class PgliteClient implements SqlClient {
  readonly driver = "pglite" as const;
  constructor(
    private readonly db: PgliteLike,
    private readonly root: PGlite | null,
  ) {}

  async query<T extends QueryRow = QueryRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    const result = await this.db.query<T>(text, params as unknown[]);
    return result.rows;
  }

  async exec(text: string): Promise<void> {
    await this.db.exec(text);
  }

  async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
    if (!this.root) throw new Error("Nested transactions are not supported on PGlite");
    return this.root.transaction(async (transaction) => {
      const wrapped = new PgliteClient(transaction as unknown as PgliteLike, null);
      return fn(wrapped);
    });
  }

  async close(): Promise<void> {
    if (this.root) await this.root.close();
  }
}

export function createPostgresClient(url: string, options: { max?: number } = {}): SqlClient {
  const sql = postgres(url, {
    max: options.max ?? 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    // postgres.js derives parameter OIDs from the statement (e.g. `$5::jsonb`) and then
    // applies its json serialiser. The store layer already passes `JSON.stringify(...)`
    // strings, so that produced double-encoded jsonb (jsonb_typeof = 'string') and every
    // read came back as a string: `parseStrategySpec` then failed with
    // "(root): Expected object, received string". Hand strings through untouched;
    // objects/arrays are still serialised as JSON.
    types: {
      json: {
        to: 3802,
        from: [114, 3802],
        serialize: (value: unknown) =>
          typeof value === "string" ? value : JSON.stringify(value),
        parse: (value: string) => JSON.parse(value),
      },
    },
  });
  return new PostgresClient(sql);
}

export async function createPgliteClient(dataDir?: string): Promise<SqlClient> {
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  return new PgliteClient(db, db);
}
