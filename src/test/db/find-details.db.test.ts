// @vitest-environment node
// Real database tests for migration 0039: venue type and address checks on the owner save functions,
// and operator-only page address changes with redirects. These functions run lazily, so every one is
// executed here with real rows, as the restricted app_user role.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asApp,
  cleanup,
  connect,
  dbTestsEnabled,
  makeAppUser,
  makeRestaurant,
  newFixtures,
  token,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";

describe.skipIf(!dbTestsEnabled)("find details and page address changes (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  const HOURS = JSON.stringify({
    Monday: { open: "07:00", close: "16:00" },
    Tuesday: { open: "07:00", close: "16:00" },
    Wednesday: null,
    Thursday: { open: "07:00", close: "16:00" },
    Friday: { open: "07:00", close: "16:00" },
    Saturday: { open: "08:00", close: "14:00" },
    Sunday: null,
  });

  async function owned(status: "active" | "draft" | "paused" = "active") {
    const restaurant = await makeRestaurant(db.owner, fixtures, { status });
    await db.owner`update restaurant set suburb = 'Parkhurst', city = 'Johannesburg', public_listed = true where id = ${restaurant.id}`;
    const user = await makeAppUser(db.owner, fixtures, { role: "owner", restaurantId: restaurant.id });
    return { ...restaurant, user };
  }

  async function operator() {
    return makeAppUser(db.owner, fixtures, { role: "operator" });
  }

  /** Run a statement and return "ok" or the short refusal code. */
  async function outcome(run: (tx: Parameters<Parameters<typeof asApp>[2]>[0]) => Promise<unknown>, persist = false) {
    return asApp(
      db.app,
      {},
      async (tx) => {
        try {
          // A savepoint, so a refusal does not poison the transaction that is about to be committed.
          await tx.savepoint((sp) => run(sp as never));
          return "ok";
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          return text;
        }
      },
      persist ? { rollback: false } : undefined,
    );
  }

  const settings = (user: string, o: { address?: string | null; suburb?: string | null; type?: string | null } = {}) => ({
    user,
    address: o.address === undefined ? "12 Oxford Road" : o.address,
    suburb: o.suburb === undefined ? "Rosebank" : o.suburb,
    type: o.type === undefined ? null : o.type,
  });

  const saveSettings = (a: ReturnType<typeof settings>, withType = true) =>
    outcome(
      (tx) =>
        withType
          ? tx`select save_owner_settings(${a.user}, 'Test Cafe', '021 555 0100', ${a.address}, ${a.suburb}, 'Johannesburg',
              'hello@example.test', true, false, 3, 2, ${a.type})`
          : tx`select save_owner_settings(${a.user}, 'Test Cafe', '021 555 0100', ${a.address}, ${a.suburb}, 'Johannesburg',
              'hello@example.test', true, false, 3, 2)`,
      true,
    );

  const savePage = (user: string, o: { suburb?: string; address?: string | null; type?: string | null } = {}, withType = true) =>
    outcome(
      (tx) =>
        withType
          ? tx`select save_owner_page(${user}, 'A fine tagline', '', ${o.suburb ?? "Rosebank"}, ${o.address === undefined ? "12 Oxford Road" : o.address}, ${HOURS}::text::jsonb, ${o.type === undefined ? null : o.type})`
          : tx`select save_owner_page(${user}, 'A fine tagline', '', ${o.suburb ?? "Rosebank"}, ${o.address === undefined ? "12 Oxford Road" : o.address}, ${HOURS}::text::jsonb)`,
      true,
    );

  const typeOf = async (id: string) => {
    const [row] = await db.owner`select venue_type from restaurant where id = ${id}`;
    return row!["venue_type"] as string;
  };

  const findIds = async (type: string | null) =>
    asApp(db.app, {}, async (tx) => {
      const rows = await tx`select id from find_restaurants('', null, ${type}, 100, 0)`;
      return rows.map((r) => r["id"] as string);
    });

  describe("venue type through Settings", () => {
    it("saves a type and Find returns the restaurant under it", async () => {
      const r = await owned();
      expect(await saveSettings(settings(r.user, { type: "bakery" }))).toBe("ok");
      expect(await typeOf(r.id)).toBe("bakery");
      expect(await findIds("bakery")).toContain(r.id);
      expect(await findIds("cafe")).not.toContain(r.id);
    });

    it("refuses a type that is not one of the five", async () => {
      const r = await owned();
      expect(await saveSettings(settings(r.user, { type: "nightclub" }))).toContain("invalid_value");
      expect(await saveSettings(settings(r.user, { type: "   " }))).toContain("invalid_value");
      expect(await typeOf(r.id)).toBe("other");
    });

    it("leaves the old type alone when the type is null or left out", async () => {
      const r = await owned();
      await saveSettings(settings(r.user, { type: "takeaway" }));
      expect(await saveSettings(settings(r.user, { type: null }))).toBe("ok");
      expect(await typeOf(r.id)).toBe("takeaway");
      expect(await saveSettings(settings(r.user), false)).toBe("ok");
      expect(await typeOf(r.id)).toBe("takeaway");
    });

    it("writes a settings audit row when only the type changes", async () => {
      const r = await owned();
      await saveSettings(settings(r.user, { type: "cafe" }));
      const before = await db.owner`select count(*)::int as n from audit_event where restaurant_id = ${r.id} and action = 'settings_changed'`;
      await saveSettings(settings(r.user, { type: "restaurant" }));
      const after = await db.owner`select count(*)::int as n from audit_event where restaurant_id = ${r.id} and action = 'settings_changed'`;
      expect(after[0]!["n"]).toBe((before[0]!["n"] as number) + 1);
    });
  });

  describe("venue type through Your page", () => {
    it("saves a type and refuses a bad one", async () => {
      const r = await owned();
      expect(await savePage(r.user, { type: "restaurant" })).toBe("ok");
      expect(await typeOf(r.id)).toBe("restaurant");
      expect(await findIds("restaurant")).toContain(r.id);
      expect(await savePage(r.user, { type: "zoo" })).toContain("invalid_value");
      expect(await typeOf(r.id)).toBe("restaurant");
    });

    it("keeps the type when it is null and still accepts the old 6 argument call", async () => {
      const r = await owned();
      await savePage(r.user, { type: "bakery" });
      expect(await savePage(r.user, { type: null })).toBe("ok");
      expect(await typeOf(r.id)).toBe("bakery");
      expect(await savePage(r.user, {}, false)).toBe("ok");
      expect(await typeOf(r.id)).toBe("bakery");
    });
  });

  describe("address and neighbourhood checks", () => {
    const goodAddresses = ["12 Oxford Road", "Shop 4, Rosebank Mall"];
    const badAddresses: [string, string][] = [
      ["a web link", "Visit http://example.test 5"],
      ["www text", "www.mysite.co.za 12"],
      ["an email", "me@example.test 12"],
      ["a 10 digit number", "0821234567"],
      ["no digits", "Oxford Road"],
      ["no letters", "12345"],
      ["4 characters", "1 Ox"],
      ["too long", `1 ${"a".repeat(220)}`],
    ];

    for (const address of goodAddresses) {
      it(`Settings and Your page save "${address}"`, async () => {
        const r = await owned();
        expect(await saveSettings(settings(r.user, { address }))).toBe("ok");
        expect(await savePage(r.user, { address })).toBe("ok");
        const [row] = await db.owner`select address from restaurant where id = ${r.id}`;
        expect(row!["address"]).toBe(address);
      });
    }

    for (const [label, address] of badAddresses) {
      it(`Settings and Your page refuse ${label}`, async () => {
        const r = await owned();
        expect(await saveSettings(settings(r.user, { address }))).toContain("invalid_value");
        expect(await savePage(r.user, { address })).toContain("invalid_value");
      });
    }

    it("an empty address is allowed", async () => {
      const r = await owned();
      expect(await saveSettings(settings(r.user, { address: "" }))).toBe("ok");
      expect(await savePage(r.user, { address: "" })).toBe("ok");
    });

    it("refuses a neighbourhood with odd characters or the wrong length", async () => {
      const r = await owned();
      for (const suburb of ["Rose<bank", "x", "R".repeat(61), "Rose;bank"]) {
        expect(await saveSettings(settings(r.user, { suburb })), suburb).toContain("invalid_value");
        expect(await savePage(r.user, { suburb }), suburb).toContain("invalid_value");
      }
      for (const suburb of ["Rosebank", "Hyde Park", "St. Andrews", "O'Reilly Park", "Craighall-Park"]) {
        expect(await saveSettings(settings(r.user, { suburb })), suburb).toBe("ok");
      }
    });

    it("lets Settings leave the neighbourhood empty, as before", async () => {
      const r = await owned();
      expect(await saveSettings(settings(r.user, { suburb: null }))).toBe("ok");
    });
  });

  describe("page address changes", () => {
    const change = (op: string, id: string, slug: string, reason = "Printed with a typo") =>
      outcome((tx) => tx`select operator_change_slug(${op}, ${id}::uuid, ${slug}, ${reason})`, true);

    const resolve = (slug: string) =>
      asApp(db.app, {}, async (tx) => {
        const [row] = await tx`select resolve_slug_redirect(${slug}) as s`;
        return row!["s"] as string | null;
      });

    const newSlug = () => `n-${token().slice(0, 20)}`;

    it("is refused for someone who is not an operator", async () => {
      const r = await owned();
      expect(await change(r.user, r.id, newSlug())).toContain("not_operator");
      const guest = await makeAppUser(db.owner, fixtures, { role: "guest" });
      expect(await change(guest, r.id, newSlug())).toContain("not_operator");
    });

    it("refuses bad, reserved, taken and same addresses and a short reason", async () => {
      const op = await operator();
      const r = await owned();
      const other = await owned();
      expect(await change(op, r.id, "Bad Slug!")).toContain("bad_slug");
      expect(await change(op, r.id, "ab")).toContain("bad_slug");
      expect(await change(op, r.id, "-no-")).toContain("bad_slug");
      expect(await change(op, r.id, "stamp")).toContain("slug_reserved");
      expect(await change(op, r.id, other.slug)).toContain("slug_taken");
      expect(await change(op, r.id, r.slug)).toContain("same_slug");
      expect(await change(op, r.id, newSlug(), "no")).toContain("bad_reason");
      expect(await change(op, r.id, newSlug(), "x".repeat(301))).toContain("bad_reason");
      expect(await change(op, "00000000-0000-0000-0000-000000000000", newSlug())).toContain("not_found");
    });

    it("changes the address, keeps the old one as a redirect and writes an audit row", async () => {
      const op = await operator();
      const r = await owned();
      const next = newSlug();
      expect(await change(op, r.id, next)).toBe("ok");
      const [row] = await db.owner`select slug from restaurant where id = ${r.id}`;
      expect(row!["slug"]).toBe(next);
      expect(await resolve(r.slug)).toBe(next);
      const audit = await db.owner`
        select meta from audit_event where restaurant_id = ${r.id} and action = 'slug_changed'`;
      expect(audit).toHaveLength(1);
      expect(audit[0]!["meta"]).toMatchObject({ old_slug: r.slug, new_slug: next });
    });

    it("follows a chain: the first old address still reaches the newest one", async () => {
      const op = await operator();
      const r = await owned();
      const second = newSlug();
      const third = newSlug();
      await change(op, r.id, second);
      await change(op, r.id, third);
      expect(await resolve(r.slug)).toBe(third);
      expect(await resolve(second)).toBe(third);
    });

    it("returns null for an unknown address and for a restaurant that is not active", async () => {
      const op = await operator();
      expect(await resolve(`unknown-${token().slice(0, 12)}`)).toBeNull();
      expect(await resolve("")).toBeNull();
      const r = await owned();
      await change(op, r.id, newSlug());
      await db.owner`update restaurant set status = 'paused' where id = ${r.id}`;
      expect(await resolve(r.slug)).toBeNull();
    });

    it("an old address cannot be used to create another restaurant", async () => {
      const op = await operator();
      const r = await owned();
      await change(op, r.id, newSlug());
      const created = await outcome(
        (tx) => tx`select operator_create_restaurant(${op}, ${`o-${token().slice(0, 10)}@test.invalid`}, 'Copycat', ${r.slug}, 'Rosebank', 'Johannesburg')`,
      );
      expect(created).toContain("slug_reserved");
      expect(
        await asApp(db.app, {}, async (tx) => {
          const [row] = await tx`select restaurant_slug_reserved(${r.slug}) as v`;
          return row!["v"] as boolean;
        }),
      ).toBe(true);
    });

    it("changing back to the old address removes its redirect", async () => {
      const op = await operator();
      const r = await owned();
      const next = newSlug();
      await change(op, r.id, next);
      expect(await change(op, r.id, r.slug)).toBe("ok");
      expect(await resolve(r.slug)).toBeNull();
      expect(await resolve(next)).toBe(r.slug);
    });

    it("another restaurant's old address is reserved for this one too", async () => {
      const op = await operator();
      const a = await owned();
      const b = await owned();
      await change(op, a.id, newSlug());
      expect(await change(op, b.id, a.slug)).toContain("slug_reserved");
    });

    it("leaves operator context as it found it", async () => {
      const op = await operator();
      const r = await owned();
      const flag = await asApp(db.app, {}, async (tx) => {
        await tx`select operator_change_slug(${op}, ${r.id}::uuid, ${newSlug()}, 'Fix the typo')`;
        const [row] = await tx`select current_setting('app.is_operator', true) as flag`;
        return row!["flag"] as string;
      });
      expect(flag === "" || flag === "false" || flag === null).toBe(true);
    });

    it("slug_redirect is not readable or writable by app_user", async () => {
      const read = await outcome((tx) => tx`select * from slug_redirect`);
      expect(read).toContain("permission denied");
      const write = await outcome((tx) => tx`insert into slug_redirect (old_slug, restaurant_id) values ('hack', ${"00000000-0000-0000-0000-000000000000"})`);
      expect(write).toContain("permission denied");
    });
  });
});
