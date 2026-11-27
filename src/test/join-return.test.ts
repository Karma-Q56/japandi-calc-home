import { describe, expect, it } from "vitest";
import { joinReturnPath } from "@/lib/auth-rules";

describe("where log-in may send someone back to", () => {
  it("accepts a join page with its table or friend code", () => {
    expect(joinReturnPath("/r/walk-cafe/join")).toBe("/r/walk-cafe/join");
    expect(joinReturnPath("/r/walk-cafe/join?src=table-1&ref=ABC123")).toBeTruthy();
  });

  it("ignores anything that could lead elsewhere", () => {
    for (const bad of [
      "https://evil.example/r/a/join",
      "//evil.example/r/a/join",
      "/r/a/join/../../ops",
      "/r/a/join?next=//evil.example",
      "/app",
      42,
    ]) {
      expect(joinReturnPath(bad)).toBeNull();
    }
  });
});
