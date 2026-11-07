import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const ownerUrl = process.env.DATABASE_URL_MIGRATE;
const appUrl = process.env.DATABASE_URL_TEST;
if (!ownerUrl || !appUrl) {
  process.stdout.write("Skipped RLS integration check: set DATABASE_URL_MIGRATE and DATABASE_URL_TEST.\n");
  process.exit(0);
}

const owner = postgres(ownerUrl, { max: 1, prepare: false });
const app = postgres(appUrl, { max: 1, prepare: false });
const suffix = randomUUID().replaceAll("-", "");
// Phone numbers must be digits only (E.164). Hex from the UUID passed only about 4 runs in 100.
const digits = String(BigInt(`0x${suffix.slice(0, 12)}`) % 10000000n).padStart(7, "0");
let restaurantA;
let restaurantB;
let customerA;
let customerB;

try {
  const fixtures = await owner.begin(async (tx) => {
    const [a] = await tx`insert into restaurant (slug, name) values (${`rls-a-${suffix.slice(0, 24)}`}, 'RLS A') returning id`;
    const [b] = await tx`insert into restaurant (slug, name) values (${`rls-b-${suffix.slice(0, 24)}`}, 'RLS B') returning id`;
    const [guestA] = await tx`insert into customer (user_id, phone_e164, name) values (${`rls-a-${suffix}`}, ${`+2782${digits}`}, 'Fixture A') returning id`;
    const [guestB] = await tx`insert into customer (user_id, phone_e164, name) values (${`rls-b-${suffix}`}, ${`+2783${digits}`}, 'Fixture B') returning id`;
    const [memberA] = await tx`insert into membership (restaurant_id, customer_id) values (${a.id}, ${guestA.id}) returning id`;
    const [memberB] = await tx`insert into membership (restaurant_id, customer_id) values (${b.id}, ${guestB.id}) returning id`;
    const [campaign] = await tx`
      insert into campaign (restaurant_id, name, message_body, audience, code, created_by)
      values (${b.id}, 'RLS fixture', 'Test message', ${tx.json({ type: "all_opted_in" })}, ${suffix.slice(0, 12).toUpperCase()}, 'rls-test') returning id
    `;

    await tx`insert into staff_member (restaurant_id, display_name, pin_hmac) values (${b.id}, 'Fixture', ${suffix})`;
    await tx`insert into menu_section (restaurant_id, name) values (${b.id}, 'Fixture')`;
    await tx`insert into menu_item (restaurant_id, name) values (${b.id}, 'Fixture')`;
    await tx`insert into special (restaurant_id, title) values (${b.id}, 'Fixture')`;
    await tx`insert into stamp_event (restaurant_id, membership_id, idempotency_key) values (${b.id}, ${memberB.id}, ${suffix})`;
    await tx`insert into reward (restaurant_id, membership_id, description) values (${b.id}, ${memberB.id}, 'Fixture')`;
    await tx`insert into payment (restaurant_id, kind, amount_cents, reference) values (${b.id}, 'topup', 1, ${`rls:${suffix}`})`;
    await tx`insert into message (campaign_id, restaurant_id, membership_id, channel) values (${campaign.id}, ${b.id}, ${memberB.id}, 'sms')`;
    await tx`insert into redemption (campaign_id, restaurant_id, membership_id) values (${campaign.id}, ${b.id}, ${memberB.id})`;
    await tx`insert into credit_ledger (restaurant_id, entry_type, amount_cents, reference) values (${b.id}, 'adjustment', 1, ${`rls-ledger:${suffix}`})`;
    await tx`insert into data_request (restaurant_id, customer_id, kind) values (${b.id}, ${guestB.id}, 'deletion')`;
    await tx`insert into audit_event (actor_type, restaurant_id, action) values ('system', ${b.id}, 'rls_fixture')`;
    return { restaurantA: a.id, restaurantB: b.id, customerA: guestA.id, customerB: guestB.id, membershipA: memberA.id };
  });
  ({ restaurantA, restaurantB, customerA, customerB } = fixtures);

  // Menu and specials are public on purpose (diners read them before they join), so other
  // restaurants may READ them. What must never happen is another restaurant WRITING to them.
  const publicReadTables = ["menu_section", "menu_item", "special"];
  const privateTables = [
    "staff_member", "membership", "stamp_event",
    "reward", "campaign", "message", "redemption", "credit_ledger", "payment", "data_request", "audit_event",
  ];
  await app.begin(async (tx) => {
    await tx`
      select set_config('app.restaurant_id', ${restaurantA}, true),
             set_config('app.customer_id', ${customerA}, true),
             set_config('app.is_operator', 'false', true)
    `;
    for (const table of privateTables) {
      const [{ count }] = await tx.unsafe(`select count(*)::int as count from ${table} where restaurant_id = $1`, [restaurantB]);
      assert.equal(count, 0, `${table} leaked restaurant B rows into restaurant A's context`);
    }
    for (const table of publicReadTables) {
      const [{ count }] = await tx.unsafe(`select count(*)::int as count from ${table} where restaurant_id = $1`, [restaurantB]);
      assert.equal(count, 1, `${table} should be publicly readable`);
      const changed = await tx.unsafe(`update ${table} set restaurant_id = restaurant_id where restaurant_id = $1 returning id`, [restaurantB]);
      assert.equal(changed.length, 0, `cross-tenant ${table} UPDATE affected rows`);
      // The app role has no DELETE right on special at all, so only the other two are tried.
      if (table !== "special") {
        const removed = await tx.unsafe(`delete from ${table} where restaurant_id = $1 returning id`, [restaurantB]);
        assert.equal(removed.length, 0, `cross-tenant ${table} DELETE affected rows`);
      }
    }
    const updated = await tx`update membership set stamps_total = stamps_total + 1 where restaurant_id = ${restaurantB} returning id`;
    const deleted = await tx`delete from membership where restaurant_id = ${restaurantB} returning id`;
    assert.equal(updated.length, 0, "cross-tenant membership UPDATE affected rows");
    assert.equal(deleted.length, 0, "cross-tenant membership DELETE affected rows");
  });

  process.stdout.write(`RLS isolation passed for ${privateTables.length} private tables and ${publicReadTables.length} public-read tables; cross-tenant UPDATE/DELETE affected zero rows.\n`);
} finally {
  if (restaurantA && restaurantB) {
    await owner.begin(async (tx) => {
      await tx`
        select set_config('app.restaurant_id', '', true),
               set_config('app.customer_id', '', true),
               set_config('app.is_operator', 'true', true)
      `;
      await tx`delete from restaurant where id in (${restaurantA}, ${restaurantB})`;
      if (customerA && customerB) await tx`delete from customer where id in (${customerA}, ${customerB})`;
    });
  }
  await Promise.all([owner.end({ timeout: 5 }), app.end({ timeout: 5 })]);
}
