import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

function loadLocalEnv() {
  try {
    const contents = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

loadLocalEnv();
if (!new Set(["development", "test"]).has(process.env.APP_ENV ?? "")) {
  throw new Error("db:reset requires APP_ENV=development or APP_ENV=test.");
}
const connectionString = process.env.DATABASE_URL_MIGRATE;
if (!connectionString) throw new Error("DATABASE_URL_MIGRATE is required.");
const databaseUrl = new URL(connectionString);
if (!new Set(["localhost", "127.0.0.1", "::1"]).has(databaseUrl.hostname)) {
  throw new Error("db:reset is limited to a local PostgreSQL host; refusing to drop a remote database.");
}

const sql = postgres(connectionString, { max: 1, prepare: false });
try {
  await sql`drop schema if exists public cascade`;
  await sql`create schema public`;
  await sql.unsafe(readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8"));
  process.stdout.write("Reset local database from db/schema.sql.\n");
} finally {
  await sql.end({ timeout: 5 });
}
