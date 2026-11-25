import { describe, expect, it } from "vitest";

import { WHEEL_FONT_MAX, WHEEL_FONT_MIN, wheelLabel, wheelLineChars } from "@/lib/wheel";

const whole = (lines: string[]) => lines.join(" ");

describe("wheelLabel", () => {
  it("keeps a short name on one line at the largest size", () => {
    expect(wheelLabel("Free coffee", 4, 90)).toEqual({
      lines: ["Free coffee"],
      fontSize: WHEEL_FONT_MAX,
      cut: false,
    });
  });

  it("shows the whole of a name the old wheel cut short", () => {
    for (const count of [2, 6, 8, 12]) {
      const label = wheelLabel("Free coffee with any meal", count, 360 / count);
      expect(label.cut).toBe(false);
      expect(whole(label.lines)).toBe("Free coffee with any meal");
      expect(label.lines.length).toBeLessThanOrEqual(3);
    }
  });

  it("shrinks the font before it cuts", () => {
    const label = wheelLabel("Complimentary breakfast platter for two", 4, 90);
    expect(label.cut).toBe(false);
    expect(label.fontSize).toBeLessThan(WHEEL_FONT_MAX);
    expect(label.fontSize).toBeGreaterThanOrEqual(WHEEL_FONT_MIN);
  });

  it("uses the small font for every prize on a crowded wheel", () => {
    expect(wheelLabel("Tea", 8, 45).fontSize).toBe(WHEEL_FONT_MIN);
    expect(wheelLabel("Tea", 7, 360 / 7).fontSize).toBe(WHEEL_FONT_MAX);
  });

  it("cuts at a word with ... only when three small lines are not enough", () => {
    const name = "A very long breakfast platter with eggs toast coffee juice and cake for the table";
    const label = wheelLabel(name, 4, 90);
    expect(label.cut).toBe(true);
    expect(label.fontSize).toBe(WHEEL_FONT_MIN);
    expect(label.lines).toHaveLength(3);
    expect(label.lines[2]!.endsWith("...")).toBe(true);
    const shown = whole(label.lines).slice(0, -3);
    expect(name.startsWith(shown)).toBe(true);
    expect(name.charAt(shown.length)).toBe(" ");
    const max = wheelLineChars(WHEEL_FONT_MIN);
    expect(label.lines.every((line) => line.length <= max)).toBe(true);
  });

  it("handles one very long word", () => {
    const label = wheelLabel("Supercalifragilisticexpialidocious", 6, 60);
    expect(label.cut).toBe(true);
    expect(label.lines).toHaveLength(1);
    expect(label.lines[0]!.endsWith("...")).toBe(true);
    expect(label.lines[0]!.length).toBeLessThanOrEqual(wheelLineChars(WHEEL_FONT_MIN));
  });

  it("uses fewer lines on a thin slice and none on a sliver", () => {
    expect(wheelLabel("Free coffee with any meal", 6, 12).lines).toHaveLength(1);
    expect(wheelLabel("Free coffee", 6, 3).lines).toEqual([]);
  });

  it("draws nothing for a blank name", () => {
    expect(wheelLabel("   ", 4, 90).lines).toEqual([]);
  });
});
