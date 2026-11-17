import "server-only";
import { Pool, types, type PoolClient } from "pg";

types.setTypeParser(20, (v) => Number(v)); // COUNT(*) etc. as numbers

/**
 * Small repository interface over two explicitly selected drivers.
 *  - STORAGE_DRIVER=neon   -> Neon Postgres via DATABASE_URL (pooled)
 *  - STORAGE_DRIVER=sqlite -> persistent local file for the local server only
 * There is NO automatic failover between them.
 * SQL is written once with $1..$n placeholders and portable syntax.
 */
export type Row = Record<string, unknown>;
export interface Tx {
  all<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Row>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<number>;
}
export interface Db extends Tx {
  driver: "neon" | "sqlite";
  tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
}

export type DriverName = "neon" | "sqlite";

export function selectedDriver(): DriverName {
  const d = (process.env.STORAGE_DRIVER || "").toLowerCase();
  if (d === "neon" || d === "sqlite") return d;
  throw new Error("STORAGE_DRIVER must be set explicitly to 'neon' or 'sqlite'.");
}

function normalize(row: Row): Row {
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (v instanceof Date) row[k] = v.toISOString();
    else if (typeof v === "bigint") row[k] = Number(v);
  }
  return row;
}

// ---------------- Postgres (Neon) ----------------
function makePg(): Db {
  const g = globalThis as unknown as { __hpPool?: Pool };
  if (!g.__hpPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not configured for STORAGE_DRIVER=neon");
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("channel_binding");
    g.__hpPool = new Pool({
      connectionString: u.toString(),
      ssl: { rejectUnauthorized: true },
      max: 10,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  const pool = g.__hpPool;
  const wrap = (q: Pool | PoolClient): Tx => ({
    async all(sql, params = []) {
      const r = await q.query(sql, params as unknown[]);
      return r.rows.map(normalize) as never;
    },
    async get(sql, params = []) {
      const r = await q.query(sql, params as unknown[]);
      return r.rows[0] ? (normalize(r.rows[0]) as never) : undefined;
    },
    async run(sql, params = []) {
      const r = await q.query(sql, params as unknown[]);
      return r.rowCount ?? 0;
    },
  });
  return {
    driver: "neon",
    ...wrap(pool),
    async exec(sql) {
      await pool.query(sql);
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(wrap(client));
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

// ---------------- SQLite (local demo) ----------------
function makeSqlite(): Db {
  const g = globalThis as unknown as { __hpSqlite?: Db };
  if (g.__hpSqlite) return g.__hpSqlite;
  // Loaded at runtime (not bundled). Requires Node 22.5+ with node:sqlite.
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
  const path = process.getBuiltinModule("node:path") as typeof import("node:path");
  const fs = process.getBuiltinModule("node:fs") as typeof import("node:fs");
  const file = process.env.SQLITE_PATH || path.join(process.cwd(), ".data", "hostelpass.sqlite");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");

  const conv = (sql: string) => sql.replace(/\$(\d+)/g, "?$1").replace(/\s+FOR UPDATE/gi, "");
  const prep = (sql: string, params: unknown[]) => {
    const st = db.prepare(conv(sql));
    const p = params.map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v === undefined ? null : v));
    return { st, p: p as never[] };
  };
  const raw: Tx = {
    async all(sql, params = []) {
      const { st, p } = prep(sql, params);
      return (st.all(...p) as Row[]).map(normalize) as never;
    },
    async get(sql, params = []) {
      const { st, p } = prep(sql, params);
      const r = st.get(...p) as Row | undefined;
      return r ? (normalize({ ...r }) as never) : undefined;
    },
    async run(sql, params = []) {
      const { st, p } = prep(sql, params);
      return Number(st.run(...p).changes);
    },
  };
  // Single connection: serialize transactions so interleaved async work cannot join them.
  let chain: Promise<unknown> = Promise.resolve();
  const lock = <T,>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => {});
    return next;
  };
  const inst: Db = {
    driver: "sqlite",
    all: (s, p) => lock(() => raw.all(s, p)),
    get: (s, p) => lock(() => raw.get(s, p)),
    run: (s, p) => lock(() => raw.run(s, p)),
    exec: (s) => lock(async () => void db.exec(s)),
    tx: (fn) =>
      lock(async () => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const out = await fn(raw);
          db.exec("COMMIT");
          return out;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      }),
  };
  g.__hpSqlite = inst;
  return inst;
}

let cached: Db | null = null;
export function getDb(): Db {
  if (cached) return cached;
  cached = selectedDriver() === "neon" ? makePg() : makeSqlite();
  return cached;
}

export function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; message?: string; errcode?: number };
  return err?.code === "23505" || /UNIQUE constraint failed/i.test(err?.message || "");
}
