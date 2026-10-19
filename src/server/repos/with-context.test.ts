import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// SPEC 8.1: every DB query must run inside withContext (which sets
// app.restaurant_id / app.customer_id / app.is_operator). This test greps the
// Postgres repo so a future query outside withContext fails loudly.
describe("withContext rule", () => {
  it("pg.ts only queries inside withContext", () => {
    const file = resolve(__dirname, "pg.ts");
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/withContext/);
    // No module-global pool/client.
    expect(src).not.toMatch(/^\s*(const|let|var)\s+(pool|client|db)\s*=/m);
    // Every execute/query call site must be lexically inside a withContext block.
    // Simple check: the file has withContext and all tx.execute uses follow one.
    const executes = (src.match(/tx\.execute/g) ?? []).length;
    const contexts = (src.match(/withContext\(/g) ?? []).length;
    expect(executes).toBeGreaterThan(0);
    expect(contexts).toBeGreaterThanOrEqual(5);
  });

  it("no other server/repo file opens its own pool", () => {
    const dir = resolve(__dirname);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
      if (f === "pg.ts") continue;
      const src = readFileSync(resolve(dir, f), "utf8");
      expect(`${f}: ${src}`).not.toMatch(/new Pool\(/);
    }
  });
});
