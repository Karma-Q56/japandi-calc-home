// npm run db:seed:dev — seeds the three demo venues, menus, specials, themes,
// hours, 60 guests, memberships, consent events, stamps and rewards into the
// DEV branch only. NEVER production.
//
// Guards (all required):
//   DATABASE_URL_DEV   pooled app_user URL of the DEV branch
//   PROD_DB_HOST        hostname of the production database; the target host
//                       must NOT equal it (real comparison, not substring)
//   DEV_SEED_CONFIRM=yes
//   SEED_BRANCH         must name the dev/preview branch (vercel-dev|preview)
//
// The app role has no BYPASSRLS, so the whole seed runs in one transaction
// that first sets app.is_operator=true (server-side, like withContext).
// No secrets are printed.
import { createHmac, randomUUID } from "node:crypto";
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

function fail(msg) {
  console.error(`Refusing: ${msg}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL_DEV;
if (!url) fail("set DATABASE_URL_DEV to the DEV branch pooled app_user URL first.");
const prodHost = process.env.PROD_DB_HOST;
if (!prodHost) fail("set PROD_DB_HOST to the production database hostname first.");
let targetHost = "";
try {
  targetHost = new URL(url).hostname.toLowerCase();
} catch {
  fail("DATABASE_URL_DEV is not a valid URL.");
}
if (targetHost === prodHost.toLowerCase()) fail("target host equals PROD_DB_HOST (production).");
if (process.env.DEV_SEED_CONFIRM !== "yes") fail("set DEV_SEED_CONFIRM=yes to confirm a dev-only seed.");
if (!["vercel-dev", "preview"].some((b) => (process.env.SEED_BRANCH ?? "").includes(b))) {
  fail("SEED_BRANCH must name the dev/preview branch (e.g. SEED_BRANCH=vercel-dev).");
}

// Demo PIN pepper for the seeded staff rows. Live PIN checks require
// PIN_PEPPER; set it to the same value to sign into dev seed staff (1234/2345/3456).
const pepper = process.env.PIN_PEPPER ?? "patron-demo-pepper-v1";
if (!process.env.PIN_PEPPER) {
  process.stdout.write("Note: PIN_PEPPER unset, seeding staff PIN hashes with the demo pepper.\n");
}

// --- Demo data, mirrored from src/data/seed.ts so live pages look like demo.
const themes = [
  { ink: "#263a2d", paper: "#f5f0e5", accent: "#b6633f", accentSoft: "#ead4c4", stampFilled: "#b6633f", stampEmpty: "#d8d0c1", headingFont: "Bricolage Grotesque", bodyFont: "DM Sans", radius: 18, stampShape: "coffee-cup", cardBackground: "paper", tagline: "A little perk for your daily ritual" },
  { ink: "#423523", paper: "#f4e8d3", accent: "#9a6333", accentSoft: "#e8d0ae", stampFilled: "#9a6333", stampEmpty: "#d7c9b2", headingFont: "Bricolage Grotesque", bodyFont: "DM Sans", radius: 12, stampShape: "croissant", cardBackground: "flat", tagline: "Fresh from the oven, made for you" },
  { ink: "#29334a", paper: "#f1f0e9", accent: "#687c61", accentSoft: "#dce4d7", stampFilled: "#687c61", stampEmpty: "#cbd0c4", headingFont: "Bricolage Grotesque", bodyFont: "DM Sans", radius: 22, stampShape: "circle", cardBackground: "gradient", tagline: "Good food, familiar faces" },
];
const hours = {
  Monday: { open: "07:00", close: "16:00" },
  Tuesday: { open: "07:00", close: "16:00" },
  Wednesday: { open: "07:00", close: "16:00" },
  Thursday: { open: "07:00", close: "16:00" },
  Friday: { open: "07:00", close: "17:00" },
  Saturday: { open: "08:00", close: "15:00" },
  Sunday: null,
};
const venues = [
  { slug: "daily-grind", name: "The Daily Grind", suburb: "Parkhurst", stamps: 8, reward: "a free coffee", credit: 4200 },
  { slug: "sunrise-bakes", name: "Sunrise Bakes", suburb: "Melville", stamps: 6, reward: "A pastry of your choice", credit: 2700 },
  { slug: "oak-table", name: "The Oak Table", suburb: "Rosebank", stamps: 10, reward: "a free main", credit: 6100 },
];
const sections = ["Coffee & tea", "From the oven", "Fresh bakes", "Lunch favourites"];
const items = [
  [0, "Flat white", "Double espresso, silky milk", 38000],
  [0, "Long black", "A smooth double espresso", 30000],
  [1, "Butter croissant", "Baked fresh each morning", 42000],
  [2, "Almond croissant", "Filled with almond cream", 48000],
  [2, "Sourdough loaf", "Slow-fermented overnight", 65000],
  [3, "Roast chicken bowl", "Seasonal greens and grains", 125000],
];
const specials = [
  ["Tuesday coffee and breakfast", "A coffee on us with any breakfast before 10am."],
  ["Morning bun special", "Add a filter coffee to any pastry for R25."],
  ["Neighbourhood lunch", "Bring a friend and enjoy a shared dessert."],
];
const firstNames = ["Thandi Mokoena", "James Ndlovu", "Sipho Nkosi", "Lerato Dlamini", "Ayesha Khan"];
const consentText = {
  loyalty: "I agree to {restaurant} saving my number and name to run my loyalty card.",
  marketing_sms: "Send me offers by SMS from {restaurant}. Reply STOP any time.",
};

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const DAY = 86400000;

// Chunked bulk insert via tx.unsafe with numbered placeholders.
async function bulkInsert(tx, table, columns, rows, chunk = 100) {
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const params = [];
    const values = slice
      .map((row, r) => `(${row.map((v) => { params.push(v); return `$${params.length}`; }).join(", ")})`)
      .join(", ");
    await tx.unsafe(`insert into ${table} (${columns.join(", ")}) values ${values} on conflict do nothing`);
  }
}

const sql = postgres(url, { max: 1, prepare: false });
try {
  await sql.begin(async (tx) => {
    await tx.unsafe("select set_config('app.is_operator', 'true', true)");

    // Venues with full themes + hours.
    const restaurantIds = [];
    for (let v = 0; v < venues.length; v++) {
      const venue = venues[v];
      const [r] = await tx`
        insert into restaurant (slug, name, status, suburb, stamps_required, reward_description, welcome_stamp, theme, hours, sms_sender_name)
        values (${venue.slug}, ${venue.name}, 'active', ${venue.suburb}, ${venue.stamps}, ${venue.reward}, true, ${tx.json(themes[v])}, ${tx.json(hours)}, ${venue.name.replace(/[^A-Za-z]/g, "").slice(0, 11)})
        on conflict (slug) do update set name = excluded.name, status = 'active', theme = excluded.theme, hours = excluded.hours
        returning id`;
      restaurantIds.push(r.id);
      await tx`insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference) values (${r.id}, 'topup', ${venue.credit}, ${`demo-topup-${v + 1}`}) on conflict (reference) do nothing`;
    }

    // Menu sections + items + specials.
    const sectionIds = [];
    for (let s = 0; s < sections.length; s++) {
      const rid = restaurantIds[s < 2 ? 0 : s === 2 ? 1 : 2];
      const [sec] = await tx`
        insert into menu_section (restaurant_id, name, sort_order) values (${rid}, ${sections[s]}, ${s})
        on conflict do nothing returning id`;
      sectionIds.push(sec?.id ?? (await tx`select id from menu_section where restaurant_id = ${rid} and name = ${sections[s]} limit 1`)[0].id);
    }
    for (let i = 0; i < items.length; i++) {
      const [secIdx, name, desc, cents] = items[i];
      const rid = restaurantIds[secIdx < 2 ? 0 : secIdx === 2 ? 1 : 2];
      await tx`insert into menu_item (restaurant_id, section_id, name, description, price_cents, sort_order) values (${rid}, ${sectionIds[secIdx]}, ${name}, ${desc}, ${cents}, ${i}) on conflict do nothing`;
    }
    for (let v = 0; v < venues.length; v++) {
      await tx`insert into special (restaurant_id, title, body, starts_at, ends_at) values (${restaurantIds[v]}, ${specials[v][0]}, ${specials[v][1]}, ${(iso(now - DAY)).toString()}::timestamptz, ${(iso(now + 14 * DAY)).toString()}::timestamptz) on conflict do nothing`;
    }

    // Staff with HMAC PINs (1234 / 2345 / 3456).
    const staffNames = ["Mia", "Thabo", "Zanele"];
    const staffPins = ["1234", "2345", "3456"];
    for (let v = 0; v < venues.length; v++) {
      await tx`delete from staff_member where restaurant_id = ${restaurantIds[v]} and display_name = ${staffNames[v]}`;
      const staffId = randomUUID();
      await tx`insert into staff_member (id, restaurant_id, display_name, pin_hmac) values (${staffId}, ${restaurantIds[v]}, ${staffNames[v]}, 'seed-pending') on conflict do nothing`;
      const hmac = createHmac("sha256", pepper).update(`${restaurantIds[v]}:${staffId}:${staffPins[v]}`).digest("hex");
      await tx`update staff_member set pin_hmac = ${hmac} where id = ${staffId}`;
    }

    // 60 guests + memberships + consent events.
    const customerIds = [];
    const memberships = [];
    for (let i = 0; i < 60; i++) {
      const v = Math.floor(i / 20);
      const phone = `+278255501${String(i + 1).padStart(2, "0")}`;
      const name = `${firstNames[i % 5]} ${i + 1}`;
      const [c] = await tx`
        insert into customer (user_id, phone_e164, name, birthday) values (${`seed:${phone}`}, ${phone}, ${name}, ${i % 6 === 0 ? "1994-06-12" : null})
        on conflict (phone_e164) do update set name = excluded.name returning id`;
      customerIds.push(c.id);
      const daysAgo = i % 11 === 0 ? 42 + (i % 10) : i % 30;
      const stampsCurrent = i % venues[v].stamps;
      const [m] = await tx`
        insert into membership (restaurant_id, customer_id, source, stamps_current, stamps_total, last_visit_at, marketing_sms, joined_at)
        values (${restaurantIds[v]}, ${c.id}, ${i % 3 === 0 ? "qr" : `table-${(i % 8) + 1}`}, ${stampsCurrent}, ${stampsCurrent + (i % 20) * 2}, ${(iso(now - daysAgo * DAY)).toString()}::timestamptz, ${i % 4 !== 0 ? "opted_in" : "not_opted_in"}, ${(iso(now - (95 - (i % 90)) * DAY)).toString()}::timestamptz)
        on conflict (restaurant_id, customer_id) do update set stamps_current = excluded.stamps_current returning id`;
      memberships.push({ id: m.id, restaurantId: restaurantIds[v], customerId: c.id, stampsCurrent, lastVisitAt: iso(now - daysAgo * DAY), marketing: i % 4 !== 0 });
      await tx`insert into consent_event (membership_id, purpose, action, wording_version, wording_text, source) values (${m.id}, 'loyalty', 'granted', 'v1', ${consentText.loyalty.replace("{restaurant}", venues[v].name)}, 'join_form') on conflict do nothing`;
      if (i % 4 !== 0) {
        await tx`insert into consent_event (membership_id, purpose, action, wording_version, wording_text, source) values (${m.id}, 'marketing_sms', 'granted', 'v1', ${consentText.marketing_sms.replace("{restaurant}", venues[v].name)}, 'join_form') on conflict do nothing`;
      }
    }

    // Stamps (one row per current stamp, spread over 90 days) + rewards.
    const stampRows = [];
    for (let i = 0; i < memberships.length; i++) {
      const m = memberships[i];
      for (let n = 0; n < m.stampsCurrent; n++) {
        stampRows.push([restaurantIds[venues.findIndex((venue, vi) => restaurantIds[vi] === m.restaurantId)], m.id, null, `seed-${i}-${n}`, iso(now - ((i * 13 + n * 7) % 90) * DAY)]);
      }
    }
    await bulkInsert(tx, "stamp_event", ["restaurant_id", "membership_id", "staff_id", "idempotency_key", "created_at"], stampRows);
    const rewardRows = [];
    memberships.forEach((m, i) => {
      if (i % 9 !== 0) return;
      const venue = venues[restaurantIds.indexOf(m.restaurantId)];
      const redeemed = Math.floor(i / 9) % 3 === 0;
      rewardRows.push([m.restaurantId, m.id, venue.reward, redeemed ? "redeemed" : "available", m.lastVisitAt, redeemed ? m.lastVisitAt : null]);
    });
    await bulkInsert(tx, "reward", ["restaurant_id", "membership_id", "description", "status", "earned_at", "redeemed_at"], rewardRows);
  });
  process.stdout.write("Seeded 3 venues, 60 guests, memberships, stamps and rewards into the DEV branch.\n");
} finally {
  await sql.end({ timeout: 5 });
}
