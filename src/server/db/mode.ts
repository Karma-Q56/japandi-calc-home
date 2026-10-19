export type DataMode = "demo" | "live";

export function getDataMode(env?: { DATA_MODE?: string | undefined }): DataMode {
  const raw = (env?.DATA_MODE ?? process.env["DATA_MODE"] ?? "demo").toLowerCase();
  return raw === "live" ? "live" : "demo";
}

export function requireDatabaseUrl(env?: { DATABASE_URL?: string | undefined }): string {
  const url = env?.DATABASE_URL ?? process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured (DATA_MODE=live needs it).");
  return url;
}
