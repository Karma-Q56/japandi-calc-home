// Used by the "Update database" button on GitHub (.github/workflows/update-database.yml).
// It picks the preview or live database, makes sure the saved address really is that
// database, lists the missing changes, and applies them only when asked to.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

// The Neon computes for each database. These are names, not passwords.
const TARGETS = {
  preview: { secret: "PREVIEW_DATABASE_URL", endpoint: "ep-fancy-haze-bah55iam" },
  production: { secret: "PRODUCTION_DATABASE_URL", endpoint: "ep-floral-cherry-bajduchg" },
};

/** Check the request and return the address to use. Throws a plain message when unsafe. */
export function chooseDatabase(env) {
  const target = TARGETS[env.TARGET];
  if (!target) throw new Error("Choose preview or production.");
  if (env.ACTION !== "check" && env.ACTION !== "apply") throw new Error("Choose check or apply.");
  if (env.TARGET === "production" && env.ACTION === "apply" && env.CONFIRM !== "PRODUCTION") {
    throw new Error("To change the live database, type PRODUCTION in the confirm box.");
  }
  const url = (env[target.secret] ?? "").trim();
  if (!url) throw new Error(`The repository secret ${target.secret} is not set.`);
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`The secret ${target.secret} is not a database address.`);
  }
  const name = host.split(".")[0];
  if (name !== target.endpoint && name !== `${target.endpoint}-pooler`) {
    throw new Error(
      `The secret ${target.secret} points at a different database. It must use ${target.endpoint}.`,
    );
  }
  return url;
}

/** Names of the changes in db/migrations that this database does not have yet. */
export async function pendingChanges(url) {
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const [table] = await sql`select to_regclass('patron_migrations.schema_migrations') as name`;
    const applied = table?.name
      ? (await sql`select name from patron_migrations.schema_migrations`).map((row) => row.name)
      : [];
    const [role] = await sql`
      select rolcanlogin, rolsuper, rolbypassrls from pg_roles where rolname = 'app_user'`;
    if (!role?.rolcanlogin || role.rolsuper || role.rolbypassrls) {
      throw new Error("The app_user database login is missing or too powerful. Stop and ask.");
    }
    return readdirSync(resolve(process.cwd(), "db/migrations"))
      .filter((file) => file.endsWith(".sql") && !applied.includes(file))
      .sort();
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const url = chooseDatabase(process.env);
  const before = await pendingChanges(url);
  console.log(`${process.env.TARGET}: ${before.length} change(s) missing.`);
  for (const name of before) console.log(`  ${name}`);
  if (process.env.ACTION === "check" || before.length === 0) return;

  const run = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL_MIGRATE: url },
  });
  if (run.status !== 0) {
    throw new Error("A change failed. Changes listed as Applied are kept, the rest were not made.");
  }
  const after = await pendingChanges(url);
  if (after.length) throw new Error(`${after.length} change(s) are still missing.`);
  console.log(`${process.env.TARGET} is up to date.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "The update failed.");
    process.exitCode = 1;
  });
}
