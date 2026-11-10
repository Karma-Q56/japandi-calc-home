// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asApp,
  cleanup,
  connect,
  dbTestsEnabled,
  makeGuest,
  makeMembership,
  makeRestaurant,
  newFixtures,
  token,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";

const sql = readFileSync(join(process.cwd(), "db/migrations/0027_sending_dev.sql"), "utf8");

// The migration text is checked on every run, so a dropped grant fails even without a database.
describe("0027_sending_dev migration (text)", () => {
  it("makes every sending function security definer with a locked search path", () => {
    const functions = [...sql.matchAll(/create or replace function (\w+)/g)].map((m) => m[1]);
    expect(functions.length).toBeGreaterThanOrEqual(6);
    for (const name of functions) {
      expect(sql).toMatch(new RegExp(`function ${name}\\([^)]*\\)\\s+returns[\\s\\S]*?security definer set search_path = public, pg_temp`));
      expect(sql).toMatch(new RegExp(`revoke all on function ${name}\\(`));
      expect(sql).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to app_user`));
    }
  });

  it("refuses non-operator callers in every function", () => {
    const checks = sql.match(/if not app_is_operator\(\) then/g) ?? [];
    expect(checks.length).toBeGreaterThanOrEqual(6);
  });
});

describe.skipIf(!dbTestsEnabled)("sending (real database)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });

  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  it("a STOP reply opts out only the restaurant that last texted the guest", async () => {
    const first = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const second = await makeRestaurant(db.owner, fixtures, { status: "active" });
    const guest = await makeGuest(db.owner, fixtures);
    const firstMembership = await makeMembership(db.owner, first.id, guest.id);
    const secondMembership = await makeMembership(db.owner, second.id, guest.id);
    await db.owner`update membership set marketing_sms = 'opted_in' where id in (${firstMembership}, ${secondMembership})`;
    const [phone] = await db.owner`select phone_e164 from customer where id = ${guest.id}`;

    const [campaign] = await db.owner`
      insert into campaign (restaurant_id, name, message_body, channel, audience, code, status, created_by)
      values (${first.id}, 'Test offer', 'hi', 'sms', '{"type":"everyone"}'::jsonb, ${`T${token().toUpperCase().replace(/[^A-Z0-9]/g, '')}`.slice(0, 12)}, 'sent', 'test')
      returning id
    `;
    await db.owner`
      insert into message (campaign_id, restaurant_id, membership_id, channel, status, sent_at, segments, cost_cents, provider, provider_message_id)
      values (${campaign!['id']}, ${first.id}, ${firstMembership}, 'sms', 'sent', now() - interval '1 hour', 1, 35, 'bulksms', ${`t-${guest.id}`})
    `;

    const changed = await asApp(
      db.app,
      { operator: true },
      async (tx) => tx`select record_sms_stop(${phone!["phone_e164"] as string}, 'bulksms', 'STOP') as n`,
      { rollback: false },
    );
    expect(Number(changed[0]!["n"])).toBe(1);

    const [a] = await db.owner`select marketing_sms from membership where id = ${firstMembership}`;
    const [b] = await db.owner`select marketing_sms from membership where id = ${secondMembership}`;
    expect(a!["marketing_sms"]).toBe("opted_out");
    expect(b!["marketing_sms"]).toBe("opted_in");
  });

  it("refuses a non-operator caller", async () => {
    const error = await asApp(db.app, {}, async (tx) =>
      tx`select record_sms_stop('+27820000000', 'bulksms', 'STOP')`,
    ).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).not.toBeNull();
    const cause = (error as { cause?: { code?: string } }).cause;
    expect(cause?.code ?? (error as { code?: string }).code).toBe("42501");
  });
});
