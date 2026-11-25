// @vitest-environment node
// Real database tests for the server side of "Your page" and the card design (D13b2): the same
// functions the screens call (load, save page, save design, remove logo, logo preview), run over the
// app_user role. Skips on a laptop unless both database addresses are set.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Viewer } from "../../server/auth-viewer";
import { DEFAULT_THEME, fullWeek } from "../../lib/live-page";
import {
  cleanup,
  connect,
  dbTestsEnabled,
  makeAppUser,
  makeRestaurant,
  newFixtures,
  appUrl,
  type DbConnections,
  type Fixtures,
} from "../db-fixture";

// Same shim as the other real-database tests: the app's withContext uses the Neon driver, which CI
// Postgres does not serve, so run the same steps over postgres-js.
vi.mock("../../server/db", async () => {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { sql } = await import("drizzle-orm");
  const pg = (await import("postgres")).default;
  return {
    withContext: async (
      context: { databaseUrl: string; restaurantId?: string | null; customerId?: string | null; isOperator?: boolean },
      callback: (transaction: unknown) => Promise<unknown>,
    ) => {
      const client = pg(context.databaseUrl, { max: 1, prepare: false });
      try {
        const database = drizzle(client);
        return await database.transaction(async (transaction) => {
          await transaction.execute(sql`
            select
              set_config('app.restaurant_id', ${context.restaurantId ?? ""}, true),
              set_config('app.customer_id', ${context.customerId ?? ""}, true),
              set_config('app.is_operator', ${context.isOperator ? "true" : "false"}, true)
          `);
          const shaped = {
            execute: async (query: unknown) => ({ rows: await transaction.execute(query as never) }),
          };
          return callback(shaped as never);
        });
      } finally {
        await client.end();
      }
    },
  };
});

const goodTheme = { ...DEFAULT_THEME, accent: "#aa3300", stampShape: "heart" as const };

describe.skipIf(!dbTestsEnabled)("live page server functions (real database)", () => {
  let db: DbConnections;
  const fixtures: Fixtures = newFixtures();
  const savedEnv = { DATABASE_URL: process.env["DATABASE_URL"] };

  beforeAll(() => {
    db = connect();
    process.env["DATABASE_URL"] = appUrl;
  });
  afterAll(async () => {
    await cleanup(db.owner, fixtures);
    await db.close();
    process.env["DATABASE_URL"] = savedEnv.DATABASE_URL;
  });

  async function owned(role: Viewer["role"] = "owner") {
    const { id, slug } = await makeRestaurant(db.owner, fixtures, { name: "Page Cafe" });
    await db.owner`update restaurant set suburb = 'Melville' where id = ${id}`;
    const userId = await makeAppUser(db.owner, fixtures, {
      role: role === "operator" ? "operator" : role,
      restaurantId: id,
    });
    const viewer: Viewer = {
      userId,
      email: `${userId}@test.invalid`,
      name: "Owner",
      role,
      restaurantId: id,
      customerId: null,
      needsPhone: false,
    };
    return { id, slug, viewer };
  }

  const input = (overrides: Record<string, unknown> = {}) => ({
    tagline: "Slow mornings, good coffee",
    about: "Roasted next door.",
    suburb: "Melville",
    venueType: "cafe",
    address: "7 Seventh Street",
    hours: {
      ...fullWeek({}),
      Monday: { open: "07:00", close: "15:00" },
      Saturday: { open: "08:00", close: "13:00" },
    },
    ...overrides,
  });

  it("loads defaults for a restaurant that never designed its card", async () => {
    const { loadOwnerPage } = await import("../../server/live-page");
    const { viewer } = await owned();
    const page = await loadOwnerPage(viewer);
    expect(page?.name).toBe("Page Cafe");
    expect(page?.theme.accent).toBe(DEFAULT_THEME.accent);
    expect(page?.tagline).toBe(DEFAULT_THEME.tagline);
    expect(page?.about).toBe("");
    expect(page?.logoVersion).toBeNull();
    expect(Object.keys(page!.hours)).toHaveLength(7);
  });

  it("saves the page and loads the same words back", async () => {
    const { saveOwnerPage, loadOwnerPage } = await import("../../server/live-page");
    const { viewer } = await owned();
    expect(await saveOwnerPage(viewer, input())).toEqual({ ok: true });
    const page = await loadOwnerPage(viewer);
    expect(page?.tagline).toBe("Slow mornings, good coffee");
    expect(page?.about).toBe("Roasted next door.");
    expect(page?.address).toBe("7 Seventh Street");
    expect(page?.hours["Monday"]).toEqual({ open: "07:00", close: "15:00" });
    expect(page?.hours["Sunday"]).toBeNull();
  });

  it("gives a plain message for bad input and never reaches the database", async () => {
    const { saveOwnerPage } = await import("../../server/live-page");
    const { id, viewer } = await owned();
    const closed = await saveOwnerPage(viewer, input({ hours: fullWeek({}) }));
    expect(closed.ok).toBe(false);
    const backwards = await saveOwnerPage(
      viewer,
      input({ hours: { ...fullWeek({}), Monday: { open: "16:00", close: "07:00" } } }),
    );
    expect(backwards).toEqual({ ok: false, message: "Monday must close after it opens." });
    const [row] = await db.owner`select about_text from restaurant where id = ${id}`;
    expect(row!["about_text"]).toBeNull();
  });

  it("refuses signed-out visitors, guests and staff without a restaurant", async () => {
    const { saveOwnerPage, saveOwnerDesign, removeOwnerLogo, loadOwnerPage } = await import("../../server/live-page");
    const { viewer } = await owned();
    for (const bad of [null, { ...viewer, role: "guest" as const }, { ...viewer, restaurantId: null }]) {
      expect((await saveOwnerPage(bad, input())).ok).toBe(false);
      expect((await saveOwnerDesign(bad, goodTheme)).ok).toBe(false);
      expect((await removeOwnerLogo(bad)).ok).toBe(false);
      expect(await loadOwnerPage(bad)).toBeNull();
    }
  });

  it("saves a design, strips a sent logo, and keeps the saved line under the name", async () => {
    const { saveOwnerPage, saveOwnerDesign, loadOwnerPage } = await import("../../server/live-page");
    const { viewer } = await owned();
    await saveOwnerPage(viewer, input());
    const result = await saveOwnerDesign(viewer, { ...goodTheme, logo: "https://evil.test/x.png", tagline: "Changed" });
    expect(result).toEqual({ ok: true });
    const page = await loadOwnerPage(viewer);
    expect(page?.theme.accent).toBe("#aa3300");
    expect(page?.theme.stampShape).toBe("heart");
    expect(page?.theme.logo).toBeUndefined();
    expect(page?.theme.tagline).toBe("Slow mornings, good coffee");
  });

  it("refuses a design with text that is too close to the background colour", async () => {
    const { saveOwnerDesign } = await import("../../server/live-page");
    const { viewer } = await owned();
    const result = await saveOwnerDesign(viewer, { ...goodTheme, ink: "#faf7ee" });
    expect(result.ok).toBe(false);
  });

  it("removes the logo, takes it off the card and writes an audit row", async () => {
    const { removeOwnerLogo, loadOwnerPage } = await import("../../server/live-page");
    const { loadLogoPreview } = await import("../../server/live-logo");
    const { id, slug, viewer } = await owned();
    await db.owner`
      insert into restaurant_logo (restaurant_id, png, print_jpeg) values (${id}, ${Buffer.from("png-bytes")}, ${Buffer.from("jpg-bytes")})`;
    await db.owner`update restaurant set theme = ${JSON.stringify({ ...DEFAULT_THEME, logo: `/r/${slug}/logo?v=1` })}::text::jsonb where id = ${id}`;
    expect((await loadOwnerPage(viewer))?.logoVersion).toBe(1);
    expect(await loadLogoPreview(viewer)).toBe(`data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`);
    expect(await removeOwnerLogo(viewer)).toEqual({ ok: true });
    const page = await loadOwnerPage(viewer);
    expect(page?.logoVersion).toBeNull();
    expect(page?.theme.logo).toBeUndefined();
    expect(await loadLogoPreview(viewer)).toBeNull();
    const audit = await db.owner`select count(*)::int as n from audit_event where restaurant_id = ${id} and action = 'logo_removed'`;
    expect(audit[0]!["n"]).toBe(1);
  });

  it("a signed-in owner of one restaurant cannot see or remove another's logo", async () => {
    const { removeOwnerLogo } = await import("../../server/live-page");
    const { loadLogoPreview } = await import("../../server/live-logo");
    const a = await owned();
    const b = await owned();
    await db.owner`
      insert into restaurant_logo (restaurant_id, png, print_jpeg) values (${a.id}, ${Buffer.from("a-png")}, ${Buffer.from("a-jpg")})`;
    expect(await loadLogoPreview(b.viewer)).toBeNull();
    await removeOwnerLogo(b.viewer);
    const rows = await db.owner`select 1 from restaurant_logo where restaurant_id = ${a.id}`;
    expect(rows.length).toBe(1);
  });
});
