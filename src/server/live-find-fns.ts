import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { FIND_VENUE_TYPES } from "@/lib/live-find";

// Live Find directory. The browser sends search text and filters only. The
// database function decides what is listed, and nothing from the browser can
// widen it (no status, listing or restaurant id is accepted here).

const findInputSchema = z.object({
  query: z.string().trim().max(80).default(""),
  suburb: z.string().trim().max(80).default(""),
  type: z
    .union([z.literal(""), z.enum(FIND_VENUE_TYPES)])
    .default(""),
  page: z.number().int().min(0).max(1000).default(0),
});

/** Hash the caller IP for the rate limit key. Never stores the raw address. */
function findRateKey(): string {
  try {
    const headers = getRequestHeaders();
    const cf = headers.get("cf-connecting-ip")?.trim();
    let raw = cf || undefined;
    if (!raw && (process.env["DATA_MODE"] ?? "").toLowerCase() !== "production") {
      raw = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
    }
    return createHash("sha256").update(`patron-find:${raw ?? "unknown"}`).digest("hex");
  } catch {
    return "unknown";
  }
}

export const searchFindFn = createServerFn({ method: "GET" })
  .validator(findInputSchema)
  .handler(async ({ data }) => {
    const { getDataMode } = await import("./db/mode");
    if (getDataMode() !== "live") {
      return { ok: false as const, message: "Find is not live yet." };
    }
    const databaseUrl = process.env["DATABASE_URL"] ?? "";
    const { searchFind } = await import("./live-find");
    try {
      const result = await searchFind(databaseUrl, data, findRateKey());
      if ("limited" in result) {
        return { ok: false as const, message: "Too many searches. Wait a minute and try again." };
      }
      return { ok: true as const, ...result };
    } catch {
      return { ok: false as const, message: "Could not load restaurants. Try again." };
    }
  });
