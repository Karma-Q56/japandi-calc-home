// npm run db:seed:dev — seeds the three demo venues into the DEV branch only.
// NEVER run against production. Refuses without explicit confirmation and when
// the target looks like production. Reads DATABASE_URL_DEV (or DATABASE_URL when
// DEV_SEED_ALLOW_URL_FALLBACK=yes). No secrets are printed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

function loadFiles() {
  for (const f of [".dev.vars", ".env"]) {
    try {
      const contents = readFileSync(resolve(process.cwd(), f), "utf8");
      for (const line of contents.split(/\r?\n/)) {
        const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!m || process.env[m[1]]) continue;
        process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
      }
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
}
loadFiles();

const url = process.env.DATABASE_URL_DEV ?? (process.env.DEV_SEED_ALLOW_URL_FALLBACK === "yes" ? process.env.DATABASE_URL : undefined);
if (!url) {
  console.error("Set DATABASE_URL_DEV to the DEV branch pooled app_user URL first.");
  process.exit(1);
}
const lowered = url.toLowerCase();
const looksProd =
  lowered.includes("production") || process.env.SEED_BRANCH === "production" || process.env.NEON_BRANCH === "production";
if (looksProd) {
  console.error("Refusing: target looks like the production branch.");
  process.exit(1);
}
if (process.env.DEV_SEED_CONFIRM !== "yes") {
  console.error("Refusing: set DEV_SEED_CONFIRM=yes and SEED_BRANCH=vercel-dev (or the preview branch) to confirm a dev-only seed.");
  process.exit(1);
}
if (!["vercel-dev", "preview"].some((b) => (process.env.SEED_BRANCH ?? "").includes(b))) {
  console.error("Refusing: SEED_BRANCH must name the dev/preview branch (e.g. SEED_BRANCH=vercel-dev).");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });
try {
  const venues = [
    { slug: "daily-grind", name: "The Daily Grind", suburb: "Parkhurst", stamps: 8, reward: "a free coffee" },
    { slug: "sunrise-bakes", name: "Sunrise Bakes", suburb: "Melville", stamps: 6, reward: "A pastry of your choice" },
    { slug: "oak-table", name: "The Oak Table", suburb: "Rosebank", stamps: 10, reward: "a free main" },
  ];
  await sql.begin(async (tx) => {
    for (const v of venues) {
      const [r] = await tx`
        insert into restaurant (slug, name, status, suburb, stamps_required, reward_description, welcome_stamp, theme, hours)
        values (${v.slug}, ${v.name}, 'active', ${v.suburb}, ${v.stamps}, ${v.reward}, true, '{}'::jsonb, '{}'::jsonb)
        on conflict (slug) do update set name = excluded.name, status = 'active'
        returning id`;
      const [sec] = await tx`
        insert into menu_section (restaurant_id, name) values (${r.id}, 'Favourites')
        on conflict do nothing returning id`;
      const sectionId = sec?.id ?? (await tx`select id from menu_section where restaurant_id = ${r.id} limit 1`)[0].id;
      await tx`
        insert into menu_item (restaurant_id, section_id, name, price_cents) values
        (${r.id}, ${sectionId}, 'House coffee', 3500),
        (${r.id}, ${sectionId}, 'House bake', 4500)
        on conflict do nothing`;
      await tx`
        insert into special (restaurant_id, title, body) values (${r.id}, 'Welcome special', 'Show this card in store.')
        on conflict do nothing`;
    }
  });
  process.stdout.write("Seeded 3 demo venues into the DEV branch.\n");
} finally {
  await sql.end({ timeout: 5 });
}
