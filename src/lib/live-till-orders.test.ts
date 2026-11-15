import { describe, expect, it } from "vitest";
import { MAX_ORDER_ITEMS, cleanLines, orderProblem } from "./live-till-orders";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("orderProblem", () => {
  it("refuses an empty list with a plain sentence", () => {
    expect(orderProblem([])).toBe("Pick at least one item, or tap Skip.");
  });

  it("accepts a valid list", () => {
    expect(orderProblem([{ menuItemId: id(1), quantity: 2 }])).toBeNull();
  });

  it("refuses more than 12 items", () => {
    const lines = Array.from({ length: MAX_ORDER_ITEMS + 1 }, (_, i) => ({
      menuItemId: id(i + 1),
      quantity: 1,
    }));
    expect(orderProblem(lines)).toBe("You can add up to 12 items for one visit.");
  });

  it("refuses a duplicate item", () => {
    expect(
      orderProblem([
        { menuItemId: id(1), quantity: 1 },
        { menuItemId: id(1), quantity: 2 },
      ]),
    ).toBe("The same item is listed twice. Try again.");
  });

  it("refuses quantities outside 1 to 20", () => {
    expect(orderProblem([{ menuItemId: id(1), quantity: 0 }])).toBe(
      "Each item can be between 1 and 20.",
    );
    expect(orderProblem([{ menuItemId: id(1), quantity: 21 }])).toBe(
      "Each item can be between 1 and 20.",
    );
    expect(orderProblem([{ menuItemId: id(1), quantity: 1.5 }])).toBe(
      "Each item can be between 1 and 20.",
    );
  });

  it("refuses a value that is not an id", () => {
    expect(orderProblem([{ menuItemId: "not-an-id", quantity: 1 }])).toBe(
      "One of the items could not be read. Try again.",
    );
  });
});

describe("cleanLines", () => {
  it("drops items whose stepper is back at zero", () => {
    expect(
      cleanLines([
        { menuItemId: id(1), quantity: 0 },
        { menuItemId: id(2), quantity: 3 },
      ]),
    ).toEqual([{ menuItemId: id(2), quantity: 3 }]);
  });
});
