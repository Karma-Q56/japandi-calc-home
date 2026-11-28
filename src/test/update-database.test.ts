// @vitest-environment node
import { describe, expect, it } from "vitest";
// @ts-expect-error plain script without types
import { chooseDatabase } from "../../scripts/update-database.mjs";

const live = "postgresql://owner:pw@ep-floral-cherry-bajduchg.c-8.eu-central-1.aws.neon.tech/neondb";
const preview = "postgresql://owner:pw@ep-fancy-haze-bah55iam-pooler.c-8.eu-central-1.aws.neon.tech/neondb";
const env = (extra: Record<string, string>) => ({
  TARGET: "preview",
  ACTION: "apply",
  PREVIEW_DATABASE_URL: preview,
  PRODUCTION_DATABASE_URL: live,
  ...extra,
});

describe("the Update database button", () => {
  it("uses the database that was chosen", () => {
    expect(chooseDatabase(env({}))).toBe(preview);
    expect(chooseDatabase(env({ TARGET: "production", CONFIRM: "PRODUCTION" }))).toBe(live);
  });

  it("only changes the live database after PRODUCTION is typed", () => {
    expect(() => chooseDatabase(env({ TARGET: "production" }))).toThrow(/type PRODUCTION/);
    expect(chooseDatabase(env({ TARGET: "production", ACTION: "check" }))).toBe(live);
  });

  it("refuses a secret that is missing or points at another database", () => {
    expect(() => chooseDatabase(env({ PREVIEW_DATABASE_URL: "" }))).toThrow(/not set/);
    expect(() => chooseDatabase(env({ PREVIEW_DATABASE_URL: live }))).toThrow(/different database/);
    expect(() => chooseDatabase(env({ PREVIEW_DATABASE_URL: "nonsense" }))).toThrow(/not a database/);
    expect(() => chooseDatabase(env({ TARGET: "other" }))).toThrow(/preview or production/);
  });
});
