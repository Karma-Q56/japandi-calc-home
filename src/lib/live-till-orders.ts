// Till orders (D13c): checks a list of what a guest had. Pure, so the browser
// and the server agree. The server checks the menu and the stamp again in SQL.

export const MAX_ORDER_ITEMS = 12;
export const MAX_ORDER_QUANTITY = 20;

export type TillOrderLine = { menuItemId: string; quantity: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns a plain sentence when the list cannot be saved, or null when it is fine. */
export function orderProblem(lines: TillOrderLine[]): string | null {
  if (lines.length === 0) return "Pick at least one item, or tap Skip.";
  if (lines.length > MAX_ORDER_ITEMS) {
    return `You can add up to ${MAX_ORDER_ITEMS} items for one visit.`;
  }
  const seen = new Set<string>();
  for (const line of lines) {
    if (!UUID.test(line.menuItemId)) return "One of the items could not be read. Try again.";
    if (seen.has(line.menuItemId)) return "The same item is listed twice. Try again.";
    seen.add(line.menuItemId);
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_ORDER_QUANTITY) {
      return `Each item can be between 1 and ${MAX_ORDER_QUANTITY}.`;
    }
  }
  return null;
}

/** Keeps only lines with a quantity above zero, so a stepper at zero drops the item. */
export function cleanLines(lines: TillOrderLine[]): TillOrderLine[] {
  return lines.filter((line) => line.quantity > 0);
}
