import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WheelPreview } from "@/components/patron/preview";
import { SpinWheelSvg } from "@/components/patron/SpinWheelSvg";
import { demoRepo } from "@/data/repo";
import { arcShare, oddsInWords, wheelArcs, weightWarning } from "@/lib/wheel";
import type { SpinSegment } from "@/data/types";

const segments: SpinSegment[] = [
  { id: "a", label: "Free coffee", weight: 30, valueCents: 0 },
  { id: "b", label: "R20 off", weight: 10, valueCents: 2000 },
  { id: "c", label: "  ", weight: 10, valueCents: 500 },
  { id: "d", label: "Bonus stamp", weight: 0, valueCents: 0 },
];

beforeEach(() => {
  demoRepo.reset();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("wheel test spin", () => {
  it("draws the wheel only from prizes with a name and a weight", () => {
    const arcs = wheelArcs(segments);
    expect(arcs.map((arc) => arc.segment.id)).toEqual(["a", "b"]);
    expect(arcs[0]!.start).toBe(0);
    expect(arcs.at(-1)!.end).toBe(360);
    expect(arcShare(arcs[0]!, arcs)).toBe(75);
    expect(arcShare(arcs[1]!, arcs)).toBe(25);
  });

  it("shows a landed prize after the wheel stops and changes nothing in the demo data", () => {
    const before = structuredClone(demoRepo.read());
    render(<WheelPreview segments={segments} />);

    fireEvent.click(screen.getByRole("button", { name: "Test spin" }));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("status").textContent).toMatch(
      /Test spin lands on (Free coffee|R20 off)\./,
    );
    expect(screen.getByRole("status").textContent).toContain("no budget was used");
    expect(screen.getByRole("status").textContent).toContain("no offer was created");

    fireEvent.click(screen.getByRole("button", { name: "Test spin again" }));
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // A test spin is an owner preview, not a real spin: no spin record, no
    // prize code, no reward and no budget change may appear.
    expect(demoRepo.read()).toEqual(before);
  });

  it("asks for a prize instead of drawing an empty wheel", () => {
    render(<WheelPreview segments={[{ id: "x", label: "", weight: 5, valueCents: 0 }]} />);
    expect(screen.getByText(/Add at least one prize/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Test spin/ })).toBeNull();
  });
});

describe("wheel odds and warnings", () => {
  it("states odds in plain words", () => {
    // Total weight with a name is 40 (30 + 10).
    expect(oddsInWords(10, segments)).toBe("about 1 in 4");
    expect(oddsInWords(40, [{ id: "z", label: "Only", weight: 40, valueCents: 0 }])).toBe("every spin");
    expect(oddsInWords(0, segments)).toBe("never on this wheel");
  });

  it("warns when no prize can be drawn or a weighted prize has no name", () => {
    expect(weightWarning([{ id: "x", label: "Coffee", weight: 0, valueCents: 0 }])).toMatch(/No prize has a chance/);
    expect(weightWarning(segments)).toMatch(/has no name/);
    expect(weightWarning([{ id: "y", label: "Coffee", weight: 5, valueCents: 0 }])).toBeNull();
  });
});

describe("wheel prize names", () => {
  const long = "Free coffee with any meal and a slice of cake for you and one friend today";

  it("lists the full name under the wheel and keeps it in the slice title", () => {
    const { container } = render(
      <SpinWheelSvg
        segments={[
          { id: "a", label: long, weight: 1, valueCents: 0 },
          { id: "b", label: "R20 off", weight: 1, valueCents: 2000 },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Prizes on this wheel" });
    expect(list.textContent).toContain(long);
    expect(container.querySelector("title")!.textContent).toBe(long);
  });

  it.each([2, 6, 12])(
    "draws %i prizes with at most three lines at a readable size",
    (count) => {
      const many = Array.from({ length: count }, (_, index) => ({
        id: `s${index}`,
        label: index === 0 ? long : `Free coffee with any meal ${index}`,
        weight: 1,
        valueCents: 0,
      }));
      const { container } = render(<SpinWheelSvg segments={many} />);
      const texts = Array.from(container.querySelectorAll("svg text"));
      expect(texts).toHaveLength(count);
      for (const text of texts) {
        expect(text.querySelectorAll("tspan").length).toBeLessThanOrEqual(3);
        expect(Number(text.getAttribute("font-size"))).toBeGreaterThanOrEqual(7);
      }
      expect(screen.getAllByRole("listitem")).toHaveLength(count);
    },
  );
});
