import { useEffect, useState } from "react";
import { getTillMenuFn, saveTillOrderFn } from "@/server/live-till-orders-fns";
import { MAX_ORDER_ITEMS, MAX_ORDER_QUANTITY, cleanLines, orderProblem } from "@/lib/live-till-orders";
import type { TillMenu } from "@/server/live-till-orders";

type Props = {
  membershipId: string;
  onDone: () => void;
};

/**
 * "What did they have?" shown at the till right after a stamp.
 * Only appears when the owner turned on orders at the till. Skip always works.
 */
export function TillOrderStep({ membershipId, onDone }: Props) {
  const [menu, setMenu] = useState<TillMenu | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getTillMenuFn().then((result) => {
      if (active) setMenu(result);
    });
    return () => {
      active = false;
    };
  }, []);

  // Setting off, or the menu could not load: show nothing, so the till is unchanged.
  if (!menu || !menu.ordersAtTill) return null;

  const chosenCount = Object.values(counts).filter((quantity) => quantity > 0).length;

  const change = (menuItemId: string, delta: number) => {
    setMessage(null);
    setCounts((current) => {
      const next = Math.min(MAX_ORDER_QUANTITY, Math.max(0, (current[menuItemId] ?? 0) + delta));
      return { ...current, [menuItemId]: next };
    });
  };

  const save = async () => {
    const lines = cleanLines(
      Object.entries(counts).map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
    );
    const problem = orderProblem(lines);
    if (problem) {
      setMessage(problem);
      return;
    }
    setBusy(true);
    const result = await saveTillOrderFn({ data: { membershipId, lines } });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    onDone();
  };

  return (
    <section className="guest-panel" aria-labelledby="till-order-title">
      <h2 id="till-order-title">What did they have?</h2>
      <p className="demo-data-note">
        Up to {MAX_ORDER_ITEMS} items. Tap Skip if you do not need to record it.
      </p>
      {menu.sections.map((section) => (
        <div key={section.id}>
          <h3>{section.name}</h3>
          {section.items.map((item) => {
            const quantity = counts[item.id] ?? 0;
            return (
              <div key={item.id} className="till-order-row">
                <span>{item.name}</span>
                <button
                  type="button"
                  className="builder-secondary"
                  aria-label={`Take one ${item.name} off`}
                  disabled={busy || quantity === 0}
                  onClick={() => change(item.id, -1)}
                >
                  −
                </button>
                <strong aria-live="polite">{quantity}</strong>
                <button
                  type="button"
                  className="builder-secondary"
                  aria-label={`Add one ${item.name}`}
                  disabled={busy || quantity >= MAX_ORDER_QUANTITY}
                  onClick={() => change(item.id, 1)}
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
      ))}
      {message && (
        <p role="alert" className="field-error">
          {message}
        </p>
      )}
      <button
        className="builder-primary"
        type="button"
        disabled={busy || chosenCount === 0}
        onClick={() => void save()}
      >
        Save
      </button>
      <button className="builder-secondary" type="button" disabled={busy} onClick={onDone}>
        Skip
      </button>
    </section>
  );
}
