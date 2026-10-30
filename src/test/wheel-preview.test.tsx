import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WheelPreview } from "@/components/patron/preview";
import { demoRepo } from "@/data/repo";
import { arcShare, wheelArcs } from "@/lib/wheel";
import type { SpinSegment } from "@/data/types";

const segments: SpinSegment[] = [
  { id: "a", label: "Free coffee", weight: 30, valueCents: 0 },
  { id: "b", label: "R20 off", weight: 10, valueCents: 2000 },
  { id: "c", label: "  ", weight: 10, valueCents: 500 },
  { id: "d", label: "Bonus stamp", weight: 0, valueCents: 0 },
];

beforeEach(() => {
  demoRepo.reset();
});

afterEach(() => {
  cleanup();
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

  it("shows a landed prize and changes nothing in the demo data", () => {
    const before = structuredClone(demoRepo.read());
    render(<WheelPreview segments={segments} />);

    fireEvent.click(screen.getByRole("button", { name: "Test spin" }));
    expect(
      screen.getByRole("status").textContent,
    ).toMatch(/Test spin lands on (Free coffee|R20 off)\./);
    expect(screen.getByRole("status").textContent).toContain("no budget was used");
    expect(screen.getByRole("status").textContent).toContain("no offer was created");

    fireEvent.click(screen.getByRole("button", { name: "Test spin again" }));
    fireEvent.click(screen.getByRole("button", { name: "Test spin again" }));

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
