import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

function loadLocalEnv() {
  try {
    const contents = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

loadLocalEnv();
const connectionString = process.env.DATABASE_URL_MIGRATE;
if (!connectionString) throw new Error("DATABASE_URL_MIGRATE is required to apply migrations.");

const sql = postgres(connectionString, { max: 1, prepare: false });
try {
  await sql`create schema if not exists patron_migrations`;
  await sql`create table if not exists patron_migrations.schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;

  const directory = resolve(process.cwd(), "db/migrations");
  const migrations = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
  for (const name of migrations) {
    const [applied] = await sql`select 1 from patron_migrations.schema_migrations where name = ${name}`;
    if (applied) continue;

    const contents = readFileSync(resolve(directory, name), "utf8");
    await sql.begin(async (transaction) => {
      await transaction.unsafe(contents);
      await transaction`insert into patron_migrations.schema_migrations (name) values (${name})`;
    });
    process.stdout.write(`Applied ${name}\n`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
