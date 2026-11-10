// @vitest-environment node
// Real database test for migration 0030 (live Find directory).
// Runs on GitHub for every push. Skips on a laptop unless both addresses are set.
// Uses fixed clock times (Johannesburg), so results never depend on the day or hour.
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
} from "../db-fixture";
import { mapFindRows, type FindRow } from "@/server/live-find";

// 2026-11-10 is a Tuesday. 12:00 Johannesburg (UTC+2) is 10:00Z.
const TUESDAY_NOON = Date.parse("2026-11-10T10:00:00Z");
// 23:30 Johannesburg on Tuesday, which is 21:30Z.
const TUESDAY_LATE = Date.parse("2026-11-10T21:30:00Z");
// 00:30 Johannesburg on Wednesday, which is 22:30Z on Tuesday.
const WEDNESDAY_EARLY = Date.parse("2026-11-10T22:30:00Z");
// 00:30 Johannesburg on Thursday, which is 22:30Z on Wednesday.
const THURSDAY_EARLY = Date.parse("2026-11-11T22:30:00Z");

describe.skipIf(!dbTestsEnabled)("live Find directory (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures = newFixtures();
  const tag = token().slice(0, 8);

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  const find = (
    args: { query?: string; suburb?: string; type?: string; limit?: number; offset?: number } = {},
  ) =>
    asApp(db.app, {}, async (tx) => {
      const rows = await tx.unsafe<FindRow[]>(
        `select * from find_restaurants($1, $2, $3, $4, $5)`,
        [args.query ?? "", args.suburb ?? "", args.type ?? "", args.limit ?? 24, args.offset ?? 0],
      );
      return rows;
    });

  const setListing = (
    id: string,
    values: {
      name: string;
      status: "draft" | "active" | "paused" | "closed";
      publicListed: boolean;
      suburb: string;
      venueType: string;
      hours?: Record<string, { open: string; close: string } | null>;
    },
  ) =>
    db.owner`
      update restaurant
      set name = ${values.name}, status = ${values.status}::restaurant_status,
          public_listed = ${values.publicListed}, suburb = ${values.suburb},
          venue_type = ${values.venueType},
          hours = ${db.owner.json(values.hours ?? {})}
      where id = ${id}
    `;

  it("returns only active and publicly listed restaurants", async () => {
    const live = await makeRestaurant(db.owner, fixtures, { name: "Live" });
    const draft = await makeRestaurant(db.owner, fixtures, { name: "Draft" });
    const unlisted = await makeRestaurant(db.owner, fixtures, { name: "Unlisted" });
    await setListing(live.id, { name: `Live ${tag}`, status: "active", publicListed: true, suburb: "Melville", venueType: "cafe" });
    await setListing(draft.id, { name: `Draft ${tag}`, status: "draft", publicListed: true, suburb: "Melville", venueType: "cafe" });
    await setListing(unlisted.id, { name: `Unlisted ${tag}`, status: "active", publicListed: false, suburb: "Melville", venueType: "cafe" });

    const ids = (await find({ query: tag })).map((r) => r.id);
    expect(ids).toContain(live.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(unlisted.id);
  });

  it("drops a restaurant once it is paused", async () => {
    const venue = await makeRestaurant(db.owner, fixtures, { name: "Pausing" });
    await setListing(venue.id, { name: `Pausing ${tag}`, status: "active", publicListed: true, suburb: "Rosebank", venueType: "bakery" });
    expect((await find({ query: `pausing ${tag}` })).map((r) => r.id)).toContain(venue.id);

    await db.owner`update restaurant set status = 'paused', public_listed = false where id = ${venue.id}`;
    expect((await find({ query: `pausing ${tag}` })).map((r) => r.id)).not.toContain(venue.id);
  });

  it("does not return private columns", async () => {
    const rows = await find({ query: tag });
    for (const row of rows) {
      expect(Object.keys(row)).not.toEqual(expect.arrayContaining(["contact", "sms_sender_name", "theme", "plan", "organization_id"]));
    }
  });

  it("searches by name, suburb and type, and escapes wildcards", async () => {
    const venue = await makeRestaurant(db.owner, fixtures, { name: "Search" });
    await setListing(venue.id, { name: `Searchable ${tag}`, status: "active", publicListed: true, suburb: "Greenside", venueType: "takeaway" });

    expect((await find({ query: `searchable ${tag}` })).map((r) => r.id)).toContain(venue.id);
    expect((await find({ query: "greenside", suburb: "Greenside" })).map((r) => r.id)).toContain(venue.id);
    expect((await find({ query: "takeaway", type: "takeaway" })).map((r) => r.id)).toContain(venue.id);
    expect((await find({ query: "bakery", type: "bakery" })).map((r) => r.id)).not.toContain(venue.id);
    // A lone % is a literal character, so it matches nothing here.
    expect(await find({ query: "%" })).toEqual([]);
  });

  it("caps a page at 24 and pages without repeats", async () => {
    const created = [];
    for (let i = 0; i < 26; i += 1) {
      const venue = await makeRestaurant(db.owner, fixtures, { name: `Page ${i}` });
      created.push(venue.id);
      await setListing(venue.id, { name: `Paged ${tag} ${String(i).padStart(2, "0")}`, status: "active", publicListed: true, suburb: "Sandton", venueType: "other" });
    }
    const first = await find({ query: `paged ${tag}`, limit: 500 });
    expect(first.length).toBe(24);
    const second = await find({ query: `paged ${tag}`, limit: 24, offset: 24 });
    expect(second.length).toBe(2);
    const seen = new Set([...first, ...second].map((r) => r.id));
    expect(seen.size).toBe(26);
  });

  it("computes open now in Johannesburg time, including after midnight", async () => {
    const venue = await makeRestaurant(db.owner, fixtures, { name: "Late" });
    await setListing(venue.id, {
      name: `Late ${tag}`,
      status: "active",
      publicListed: true,
      suburb: "Parkhurst",
      venueType: "restaurant",
      // Hours use long weekday names, the same keys the venue pages use.
      hours: {
        Tuesday: { open: "10:00", close: "23:00" },
        Wednesday: { open: "09:00", close: "01:00" },
      },
    });
    const [row] = (await find({ query: `late ${tag}` })).filter((r) => r.id === venue.id);
    expect(row).toBeDefined();
    const at = (ms: number) => mapFindRows([row!], ms)[0]!.open;
    // Tuesday noon is inside Tuesday's 10:00 to 23:00 window.
    expect(at(TUESDAY_NOON)).toBe(true);
    // Tuesday 23:30 is after the Tuesday close.
    expect(at(TUESDAY_LATE)).toBe(false);
    // Wednesday 00:30: Tuesday's window ends at 23:00, so this is closed until Wednesday opens at 09:00.
    expect(at(WEDNESDAY_EARLY)).toBe(false);
    // Thursday 00:30: Wednesday's 09:00 to 01:00 window runs past midnight, so this is open.
    expect(at(THURSDAY_EARLY)).toBe(true);
  });

  it("flags member offers only for active, non-public specials", async () => {
    const withOffer = await makeRestaurant(db.owner, fixtures, { name: "Offer" });
    const withPublic = await makeRestaurant(db.owner, fixtures, { name: "Public" });
    await setListing(withOffer.id, { name: `Offer ${tag}`, status: "active", publicListed: true, suburb: "Illovo", venueType: "cafe" });
    await setListing(withPublic.id, { name: `Public ${tag}`, status: "active", publicListed: true, suburb: "Illovo", venueType: "cafe" });
    await db.owner`insert into special (restaurant_id, title, active, kind) values (${withOffer.id}, 'Members', true, 'members')`;
    await db.owner`insert into special (restaurant_id, title, active, kind) values (${withPublic.id}, 'Everyone', true, 'public')`;

    const rows = await find({ query: `${tag}`, suburb: "Illovo" });
    expect(rows.find((r) => r.id === withOffer.id)?.has_member_offer).toBe(true);
    expect(rows.find((r) => r.id === withPublic.id)?.has_member_offer).toBe(false);
  });

  it("never shows another restaurant's draft, even when searched directly", async () => {
    const draft = await makeRestaurant(db.owner, fixtures, { name: "Secret" });
    await setListing(draft.id, { name: `Secret draft ${tag}`, status: "draft", publicListed: true, suburb: "Melville", venueType: "cafe" });
    const guest = await makeGuest(db.owner, fixtures);
    await makeMembership(db.owner, draft.id, guest.id);
    expect((await find({ query: `secret draft ${tag}` })).map((r) => r.id)).not.toContain(draft.id);
  });

  it("lets app_user run find_restaurants", async () => {
    const [row] = await db.owner`select has_function_privilege('app_user', 'find_restaurants(text,text,text,integer,integer)', 'execute') as ok`;
    expect(row!["ok"]).toBe(true);
  });
});
