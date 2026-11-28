import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StampCircles } from "@/components/patron/kit";

afterEach(cleanup);

describe("stamp circles", () => {
  it("survives a half typed number in the settings box", () => {
    for (const total of [999999999, -5, Number.NaN, 7.5]) {
      const { container } = render(<StampCircles total={total} filled={1} />);
      expect(container.querySelectorAll(".pk-stamp").length).toBeLessThanOrEqual(60);
      cleanup();
    }
  });
});
