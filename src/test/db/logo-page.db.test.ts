// @vitest-environment node
// Real database tests for migration 0034 and the logo table (D13b2): the owner's page words and
// opening hours, the card design, the logo upload and removal, and the checks that stop one
// restaurant from touching another. Runs on GitHub for every push. Skips on a laptop unless both
// database addresses are set.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asApp,
  cleanup,
  connect,
  dbTestsEnabled,
  makeAppUser,
  makeRestaurant,
  newFixtures,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";

const week = (overrides: Record<string, unknown> = {}) => ({
  Monday: { open: "07:00", close: "16:00" },
  Tuesday: { open: "07:00", close: "16:00" },
  Wednesday: null,
  Thursday: { open: "07:00", close: "16:00" },
  Friday: { open: "07:00", close: "16:00" },
  Saturday: { open: "08:00", close: "14:00" },
  Sunday: null,
  ...overrides,
});

const theme = (overrides: Record<string, unknown> = {}) => ({
  ink: "#26332a",
  paper: "#faf7ef",
  accent: "#b6633f",
  accentSoft: "#ecd6c8",
  stampFilled: "#b6633f",
  stampEmpty: "#ddd7ca",
  headingFont: "Bricolage Grotesque",
  bodyFont: "DM Sans",
  radius: 16,
  stampShape: "circle",
  cardBackground: "flat",
  tagline: "A little perk, made for you",
  ...overrides,
});

const svg = (inner = "%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E") =>
  `data:image/svg+xml;charset=utf-8,${inner}`;

const png = (bytes: number) => Buffer.alloc(bytes, 1);

describe.skipIf(!dbTestsEnabled)("page, design and logo (real database, as app_user)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();

  beforeAll(() => {
    db = connect();
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
  });

  async function restaurantWithOwner(
    role: "owner" | "manager" | "guest" = "owner",
    status: "draft" | "active" = "draft",
  ) {
    const { id, slug } = await makeRestaurant(db.owner, fixtures, { status });
    await db.owner`update restaurant set suburb = 'Parkhurst' where id = ${id}`;
    const user = await makeAppUser(db.owner, fixtures, { role, restaurantId: id });
    return { id, slug, user };
  }

  const savePage = (user: string, overrides: Partial<Record<string, unknown>> = {}) => {
    const a = {
      tagline: "Good coffee, slow mornings",
      about: "A small place that roasts its own beans.",
      suburb: "Parkhurst",
      address: "12 Fourth Avenue",
      hours: week(),
      ...overrides,
    };
    return asApp(
      db.app,
      {},
      (tx) =>
        tx`select save_owner_page(${user}, ${a.tagline as string}, ${a.about as string}, ${a.suburb as string},
          ${a.address as string}, ${JSON.stringify(a.hours)}::text::jsonb)`,
      { rollback: false },
    );
  };

  const saveDesign = (user: string, value: unknown) =>
    asApp(db.app, {}, (tx) => tx`select save_owner_design(${user}, ${JSON.stringify(value)}::text::jsonb)`, {
      rollback: false,
    });

  const syncLogo = (user: string) =>
    asApp(db.app, {}, (tx) => tx`select sync_owner_logo(${user})`, { rollback: false });

  // ------------------------------------------------------------------ validators
  describe("valid_opening_hours", () => {
    const check = async (value: unknown) => {
      const [row] = await db.owner`select valid_opening_hours(${JSON.stringify(value)}::text::jsonb) as ok`;
      return row!["ok"] as boolean;
    };

    it("accepts a normal week with closed days", async () => {
      expect(await check(week())).toBe(true);
    });
    it("refuses a week with every day closed", async () => {
      expect(
        await check({ Monday: null, Tuesday: null, Wednesday: null, Thursday: null, Friday: null, Saturday: null, Sunday: null }),
      ).toBe(false);
    });
    it("refuses closing at or before opening, bad times and extra keys", async () => {
      expect(await check(week({ Monday: { open: "16:00", close: "07:00" } }))).toBe(false);
      expect(await check(week({ Monday: { open: "07:00", close: "07:00" } }))).toBe(false);
      expect(await check(week({ Monday: { open: "7am", close: "4pm" } }))).toBe(false);
      expect(await check(week({ Monday: { open: "25:00", close: "26:00" } }))).toBe(false);
      expect(await check(week({ Monday: { open: "07:00", close: "16:00", note: "x" } }))).toBe(false);
      expect(await check(week({ Funday: { open: "07:00", close: "16:00" } }))).toBe(false);
      expect(await check(week({ Monday: "open" }))).toBe(false);
    });
    it("refuses something that is not an object", async () => {
      expect(await check([])).toBe(false);
      expect(await check("Monday")).toBe(false);
      const [row] = await db.owner`select valid_opening_hours(null) as ok`;
      expect(row!["ok"]).toBe(false);
    });
  });

  describe("valid_card_theme", () => {
    const check = async (value: unknown) => {
      const [row] = await db.owner`select valid_card_theme(${JSON.stringify(value)}::text::jsonb) as ok`;
      return row!["ok"] as boolean;
    };

    it("accepts a normal theme and one with a pixel stamp", async () => {
      expect(await check(theme())).toBe(true);
      expect(await check(theme({ logoStamp: { grid: 16, filled: svg(), empty: svg() } }))).toBe(true);
    });
    it("accepts the largest pixel stamp the app makes (32 by 32 cells)", async () => {
      const cells = Array.from({ length: 32 * 32 }, (_, i) => {
        const x = i % 32;
        const y = Math.floor(i / 32);
        return `<rect x="${x}" y="${y}" width="1" height="1" fill="#aabbcc" fill-opacity="0.12"/>`;
      }).join("");
      const art = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="96" height="96" role="img">${cells}</svg>`;
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(art)}`;
      expect(url.length).toBeLessThan(160000);
      expect(await check(theme({ logoStamp: { grid: 32, filled: url, empty: url } }))).toBe(true);
    });
    it("refuses bad colours, fonts, shapes, backgrounds, radius and taglines", async () => {
      expect(await check(theme({ ink: "red" }))).toBe(false);
      expect(await check(theme({ paper: "#fff" }))).toBe(false);
      expect(await check(theme({ headingFont: "Comic Sans" }))).toBe(false);
      expect(await check(theme({ bodyFont: "Papyrus" }))).toBe(false);
      expect(await check(theme({ stampShape: "skull" }))).toBe(false);
      expect(await check(theme({ cardBackground: "photo" }))).toBe(false);
      expect(await check(theme({ radius: 41 }))).toBe(false);
      expect(await check(theme({ radius: -1 }))).toBe(false);
      expect(await check(theme({ radius: "16" }))).toBe(false);
      expect(await check(theme({ tagline: "x" }))).toBe(false);
      expect(await check(theme({ tagline: "x".repeat(71) }))).toBe(false);
    });
    it("refuses pixel stamps that are not plain pictures", async () => {
      expect(await check(theme({ logoStamp: { grid: 16, filled: "https://evil.test/a.svg", empty: svg() } }))).toBe(false);
      expect(await check(theme({ logoStamp: { grid: 16, filled: svg("%3Cscript%3Ealert(1)%3C%2Fscript%3E"), empty: svg() } }))).toBe(false);
      expect(await check(theme({ logoStamp: { grid: 16, filled: svg("%3Csvg%20onload%3Dalert(1)%3E"), empty: svg() } }))).toBe(false);
      expect(await check(theme({ logoStamp: { grid: 2, filled: svg(), empty: svg() } }))).toBe(false);
      expect(await check(theme({ logoStamp: { grid: 16, filled: svg("a".repeat(160001)), empty: svg() } }))).toBe(false);
      expect(await check(theme({ logoStamp: "no" }))).toBe(false);
    });
  });

  // ------------------------------------------------------------------ save_owner_page
  describe("save_owner_page", () => {
    it("saves the words and hours for an owner, keeps other theme keys and writes an audit row", async () => {
      const { id, user } = await restaurantWithOwner("owner");
      await db.owner`update restaurant set theme = ${JSON.stringify(theme({ accent: "#112233" }))}::text::jsonb where id = ${id}`;
      await savePage(user);
      const [row] = await db.owner`
        select about_text, suburb, address, hours, theme from restaurant where id = ${id}`;
      expect(row!["about_text"]).toBe("A small place that roasts its own beans.");
      expect(row!["suburb"]).toBe("Parkhurst");
      expect(row!["address"]).toBe("12 Fourth Avenue");
      expect((row!["hours"] as Record<string, unknown>)["Wednesday"]).toBeNull();
      const stored = row!["theme"] as Record<string, unknown>;
      expect(stored["tagline"]).toBe("Good coffee, slow mornings");
      expect(stored["accent"]).toBe("#112233");
      const audit = await db.owner`
        select count(*)::int as n from audit_event where restaurant_id = ${id} and action = 'page_changed'`;
      expect(audit[0]!["n"]).toBe(1);
    });

    it("lets a manager save too, and empty story and address store as null", async () => {
      const { id, user } = await restaurantWithOwner("manager");
      await savePage(user, { about: "   ", address: "" });
      const [row] = await db.owner`select about_text, address from restaurant where id = ${id}`;
      expect(row!["about_text"]).toBeNull();
      expect(row!["address"]).toBeNull();
    });

    it("refuses a guest login and a login that does not exist, and changes nothing", async () => {
      const { id, user } = await restaurantWithOwner("guest");
      await expect(savePage(user)).rejects.toThrow(/not_allowed/);
      await expect(savePage("t-no-such-user")).rejects.toThrow(/not_allowed/);
      const [row] = await db.owner`select about_text, address from restaurant where id = ${id}`;
      expect(row!["about_text"]).toBeNull();
      expect(row!["address"]).toBeNull();
    });

    it("only ever changes the caller's own restaurant", async () => {
      const a = await restaurantWithOwner("owner");
      const b = await restaurantWithOwner("owner");
      await savePage(a.user, { about: "Only for A" });
      const [other] = await db.owner`select about_text, address from restaurant where id = ${b.id}`;
      expect(other!["about_text"]).toBeNull();
      expect(other!["address"]).toBeNull();
    });

    it("refuses invalid words and hours with invalid_value", async () => {
      const { id, user } = await restaurantWithOwner("owner");
      await expect(savePage(user, { tagline: "x" })).rejects.toThrow(/invalid_value/);
      await expect(savePage(user, { tagline: "x".repeat(71) })).rejects.toThrow(/invalid_value/);
      await expect(savePage(user, { about: "x".repeat(241) })).rejects.toThrow(/invalid_value/);
      await expect(savePage(user, { suburb: "" })).rejects.toThrow(/invalid_value/);
      await expect(savePage(user, { address: "x".repeat(121) })).rejects.toThrow(/invalid_value/);
      await expect(
        savePage(user, { hours: week({ Monday: { open: "16:00", close: "07:00" } }) }),
      ).rejects.toThrow(/invalid_value/);
      await expect(savePage(user, { hours: {} })).rejects.toThrow(/invalid_value/);
      const [row] = await db.owner`select about_text from restaurant where id = ${id}`;
      expect(row!["about_text"]).toBeNull();
    });

    it("leaves operator context as it found it", async () => {
      const { user } = await restaurantWithOwner("owner");
      const flag = await asApp(
        db.app,
        {},
        async (tx) => {
          await tx`select save_owner_page(${user}, 'Fine line here', '', 'Parkhurst', '', ${JSON.stringify(week())}::text::jsonb)`;
          const [row] = await tx`select current_setting('app.is_operator', true) as flag`;
          return row!["flag"] as string;
        },
        { rollback: true },
      );
      expect(flag).toBe("false");
    });
  });

  // ------------------------------------------------------------------ save_owner_design
  describe("save_owner_design", () => {
    it("saves a valid design and writes an audit row", async () => {
      const { id, user } = await restaurantWithOwner("owner");
      await saveDesign(user, theme({ accent: "#aa3300", stampShape: "heart", cardBackground: "gradient" }));
      const [row] = await db.owner`select theme from restaurant where id = ${id}`;
      const stored = row!["theme"] as Record<string, unknown>;
      expect(stored["accent"]).toBe("#aa3300");
      expect(stored["stampShape"]).toBe("heart");
      const audit = await db.owner`
        select count(*)::int as n from audit_event where restaurant_id = ${id} and action = 'design_changed'`;
      expect(audit[0]!["n"]).toBe(1);
    });

    it("keeps the stored logo link, cover photo and tagline, and ignores any sent in the design", async () => {
      const { id, user } = await restaurantWithOwner("owner");
      await db.owner`update restaurant set theme = ${JSON.stringify(
        theme({ logo: "/r/mine/logo?v=3", coverPhoto: "data:image/webp;base64,AAAA", tagline: "Saved on Your page" }),
      )}::text::jsonb where id = ${id}`;
      await saveDesign(
        user,
        theme({ logo: "https://evil.test/x.png", coverPhoto: "https://evil.test/y.png", tagline: "Sneaky change", accent: "#010203" }),
      );
      const [row] = await db.owner`select theme from restaurant where id = ${id}`;
      const stored = row!["theme"] as Record<string, unknown>;
      expect(stored["logo"]).toBe("/r/mine/logo?v=3");
      expect(stored["coverPhoto"]).toBe("data:image/webp;base64,AAAA");
      expect(stored["tagline"]).toBe("Saved on Your page");
      expect(stored["accent"]).toBe("#010203");
    });

    it("never stores a logo that was not uploaded", async () => {
      const { id, user } = await restaurantWithOwner("owner");
      await saveDesign(user, theme({ logo: "https://evil.test/x.png" }));
      const [row] = await db.owner`select theme from restaurant where id = ${id}`;
      expect((row!["theme"] as Record<string, unknown>)["logo"]).toBeUndefined();
    });

    it("refuses invalid designs with invalid_value and changes nothing", async () => {
      const { id, user } = await restaurantWithOwner("owner");
      await expect(saveDesign(user, theme({ ink: "blue" }))).rejects.toThrow(/invalid_value/);
      await expect(saveDesign(user, theme({ cardBackground: "photo" }))).rejects.toThrow(/invalid_value/);
      await expect(
        saveDesign(user, theme({ logoStamp: { grid: 16, filled: svg("%3Cscript%3E"), empty: svg() } })),
      ).rejects.toThrow(/invalid_value/);
      const [row] = await db.owner`select theme from restaurant where id = ${id}`;
      expect(row!["theme"]).toEqual({});
    });

    it("refuses guests and unknown logins, and never touches another restaurant", async () => {
      const guest = await restaurantWithOwner("guest");
      await expect(saveDesign(guest.user, theme())).rejects.toThrow(/not_allowed/);
      await expect(saveDesign("t-no-such-user", theme())).rejects.toThrow(/not_allowed/);
      const a = await restaurantWithOwner("owner");
      const b = await restaurantWithOwner("owner");
      await saveDesign(a.user, theme({ accent: "#abcdef" }));
      const [other] = await db.owner`select theme from restaurant where id = ${b.id}`;
      expect(other!["theme"]).toEqual({});
    });
  });

  // ------------------------------------------------------------------ logo table + sync
  describe("logo upload, replace and remove", () => {
    /** The same upsert the app runs when an owner uploads. */
    const upload = (restaurantId: string, pngBytes = 2000, jpegBytes = 2000) =>
      asApp(
        db.app,
        { restaurantId },
        async (tx) => {
          const [row] = await tx`
            insert into restaurant_logo (restaurant_id, png, print_jpeg, version, updated_at)
            values (${restaurantId}, ${png(pngBytes)}, ${png(jpegBytes)}, 1, now())
            on conflict (restaurant_id) do update
              set png = excluded.png, print_jpeg = excluded.print_jpeg,
                  version = restaurant_logo.version + 1, updated_at = now()
            returning version`;
          return row!["version"] as number;
        },
        { rollback: false },
      );

    it("lets an owner upload for their own restaurant and bumps the version on replace", async () => {
      const { id } = await restaurantWithOwner("owner");
      expect(await upload(id)).toBe(1);
      expect(await upload(id)).toBe(2);
      expect(await upload(id)).toBe(3);
    });

    it("refuses a PNG over 512 KB and a print JPEG over 100 KB, and an empty file", async () => {
      const { id } = await restaurantWithOwner("owner");
      await expect(upload(id, 524289, 2000)).rejects.toThrow(/restaurant_logo/);
      await expect(upload(id, 2000, 102401)).rejects.toThrow(/restaurant_logo/);
      await expect(upload(id, 0, 2000)).rejects.toThrow(/restaurant_logo/);
      const rows = await db.owner`select 1 from restaurant_logo where restaurant_id = ${id}`;
      expect(rows.length).toBe(0);
    });

    it("accepts files at the limits", async () => {
      const { id } = await restaurantWithOwner("owner");
      expect(await upload(id, 524288, 102400)).toBe(1);
    });

    it("stops one restaurant writing, replacing or removing another's logo", async () => {
      const a = await restaurantWithOwner("owner");
      const b = await restaurantWithOwner("owner");
      await upload(a.id);
      // B inserting a row for A is refused by the row policy.
      await expect(
        asApp(db.app, { restaurantId: b.id }, (tx) =>
          tx`insert into restaurant_logo (restaurant_id, png, print_jpeg) values (${a.id}, ${png(10)}, ${png(10)})
             on conflict (restaurant_id) do update set png = excluded.png`,
        ),
      ).rejects.toThrow();
      // B updating or deleting A's row changes nothing.
      const updated = await asApp(
        db.app,
        { restaurantId: b.id },
        (tx) => tx`update restaurant_logo set png = ${png(5)}, version = 99 where restaurant_id = ${a.id} returning 1`,
        { rollback: false },
      );
      expect(updated.length).toBe(0);
      const deleted = await asApp(
        db.app,
        { restaurantId: b.id },
        (tx) => tx`delete from restaurant_logo where restaurant_id = ${a.id} returning 1`,
        { rollback: false },
      );
      expect(deleted.length).toBe(0);
      const [row] = await db.owner`select version, octet_length(png) as size from restaurant_logo where restaurant_id = ${a.id}`;
      expect(row!["version"]).toBe(1);
      expect(row!["size"]).toBe(2000);
    });

    it("hides a draft restaurant's logo from everyone but its owner, and shows it once active", async () => {
      const a = await restaurantWithOwner("owner", "draft");
      const b = await restaurantWithOwner("owner", "active");
      await upload(a.id);
      const read = (restaurantId: string | undefined, target: string) =>
        asApp(db.app, restaurantId ? { restaurantId } : {}, (tx) =>
          tx`select version from restaurant_logo where restaurant_id = ${target}`,
        );
      expect((await read(a.id, a.id)).length).toBe(1);
      expect((await read(b.id, a.id)).length).toBe(0);
      expect((await read(undefined, a.id)).length).toBe(0);
      await db.owner`update restaurant set status = 'active' where id = ${a.id}`;
      expect((await read(b.id, a.id)).length).toBe(1);
      expect((await read(undefined, a.id)).length).toBe(1);
    });

    it("lets an owner remove their own logo", async () => {
      const { id } = await restaurantWithOwner("owner");
      await upload(id);
      const gone = await asApp(
        db.app,
        { restaurantId: id },
        (tx) => tx`delete from restaurant_logo where restaurant_id = ${id} returning 1`,
        { rollback: false },
      );
      expect(gone.length).toBe(1);
    });

    it("sync_owner_logo points the card at the stored logo, follows replace and clears on remove", async () => {
      const { id, slug, user } = await restaurantWithOwner("owner");
      await db.owner`update restaurant set theme = ${JSON.stringify(theme({ accent: "#445566" }))}::text::jsonb where id = ${id}`;
      await upload(id);
      await syncLogo(user);
      let [row] = await db.owner`select theme from restaurant where id = ${id}`;
      expect((row!["theme"] as Record<string, unknown>)["logo"]).toBe(`/r/${slug}/logo?v=1`);
      await upload(id);
      await syncLogo(user);
      [row] = await db.owner`select theme from restaurant where id = ${id}`;
      expect((row!["theme"] as Record<string, unknown>)["logo"]).toBe(`/r/${slug}/logo?v=2`);
      expect((row!["theme"] as Record<string, unknown>)["accent"]).toBe("#445566");
      await db.owner`delete from restaurant_logo where restaurant_id = ${id}`;
      await syncLogo(user);
      [row] = await db.owner`select theme from restaurant where id = ${id}`;
      expect((row!["theme"] as Record<string, unknown>)["logo"]).toBeUndefined();
      expect((row!["theme"] as Record<string, unknown>)["accent"]).toBe("#445566");
    });

    it("sync_owner_logo refuses guests and unknown logins, and only touches the caller's restaurant", async () => {
      const guest = await restaurantWithOwner("guest");
      await expect(syncLogo(guest.user)).rejects.toThrow(/not_allowed/);
      await expect(syncLogo("t-no-such-user")).rejects.toThrow(/not_allowed/);
      const a = await restaurantWithOwner("owner");
      const b = await restaurantWithOwner("owner");
      await upload(b.id);
      await syncLogo(a.user);
      const [other] = await db.owner`select theme from restaurant where id = ${b.id}`;
      expect((other!["theme"] as Record<string, unknown>)["logo"]).toBeUndefined();
    });
  });

  // ------------------------------------------------------------------ the story column
  it("limits the story to 240 characters in the table as well", async () => {
    const { id } = await restaurantWithOwner("owner");
    await expect(
      db.owner`update restaurant set about_text = ${"x".repeat(241)} where id = ${id}`,
    ).rejects.toThrow(/restaurant_about_text_len/);
    await db.owner`update restaurant set about_text = ${"x".repeat(240)} where id = ${id}`;
  });
});
