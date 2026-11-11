import { describe, expect, it } from "vitest";
import { GAUTENG_SUBURBS } from "@/data/gauteng-suburbs";
import {
  sortByDistance,
  suburbDistanceKm,
  uniqueSuburbNames,
} from "@/lib/live-find";

describe("live Find helpers", () => {
  it("sorts venues nearest first, unknown suburbs last", () => {
    const rows = [
      { name: "Far", suburb: "Centurion" },
      { name: "Unknown", suburb: "Nowhere" },
      { name: "Near", suburb: "Parkhurst" },
      { name: "Mid", suburb: "Sandton" },
    ];
    const sorted = sortByDistance(rows, "Parkhurst").map((r) => r.name);
    expect(sorted).toEqual(["Near", "Mid", "Far", "Unknown"]);
  });

  it("returns no distance when a suburb is unknown", () => {
    expect(suburbDistanceKm("Parkhurst", null)).toBeUndefined();
    expect(suburbDistanceKm("Nowhere", "Parkhurst")).toBeUndefined();
  });

  it("lists each suburb name once", () => {
    expect(uniqueSuburbNames(["Melville", "Melville ", null, "Rosebank", "", "Melville"])).toEqual([
      "Melville",
      "Rosebank",
    ]);
  });

  it("has no duplicate suburb names in the picker list", () => {
    const names = GAUTENG_SUBURBS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
