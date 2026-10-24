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
const connectionString = process.env.DATABASE_URL_MIGRATE;
const password = process.env.APP_USER_PASSWORD;
if (!connectionString) throw new Error("DATABASE_URL_MIGRATE is required.");
if (!password || password.length < 24) {
  throw new Error("APP_USER_PASSWORD must be set to a random value of at least 24 characters.");
}

const sql = postgres(connectionString, { max: 1, prepare: false });
try {
  const [{ exists }] = await sql`select exists(select 1 from pg_roles where rolname = 'app_user') as exists`;
  // Build the format pattern in JS (it derives from a boolean, so embedding it is safe)
  // and cast the password param: Postgres cannot infer the type of a bound
  // parameter in format()'s variadic "any" slot (error 42P18) on this driver/PG combo.
  const action = exists ? "alter" : "create";
  const [{ statement }] = await sql.unsafe(
    `select format('${action} role app_user with login password %L', $1::text) as statement`,
    [password],
  );
  await sql.unsafe(statement);
  const [role] = await sql`
    select rolcanlogin, rolsuper, rolbypassrls
    from pg_roles where rolname = 'app_user'
  `;
  if (!role?.rolcanlogin || role.rolsuper || role.rolbypassrls) {
    throw new Error("app_user must be a login role without superuser or BYPASSRLS.");
  }
  process.stdout.write("app_user login configured; superuser and BYPASSRLS are disabled.\n");
} finally {
  await sql.end({ timeout: 5 });
}
