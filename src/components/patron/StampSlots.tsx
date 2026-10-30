import type { Theme } from "@/data/types";

interface StampSlotsProps {
  filled: number;
  total: number;
  theme: Theme;
  newlyGained?: number;
}

function columnsFor(total: number): number {
  if (total === 6) return 3;
  if (total === 10) return 5;
  return 4;
}

export function StampSlots({ filled, total, theme, newlyGained = 0 }: StampSlotsProps) {
  const columns = columnsFor(total);
  return (
    <div
      className="stamp-slots"
      role="img"
      aria-label={`${filled} of ${total} stamps`}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(40px, 1fr))`,
        gap: 10,
      }}
    >
      {Array.from({ length: total }, (_, index) => {
        const isFilled = index < filled;
        const isNew = newlyGained > 0 && index >= filled - newlyGained;
        return (
          <span
            key={index}
            className={isFilled ? "stamp-slot filled new-stamp" : "stamp-slot"}
            data-new={isNew || undefined}
            aria-hidden="true"
            style={{
              minWidth: 40,
              minHeight: 40,
              display: "grid",
              placeItems: "center",
              borderRadius: theme.stampShape === "circle" ? "50%" : 12,
              background: isFilled ? theme.stampFilled : "transparent",
              border: `2px solid ${isFilled ? theme.stampFilled : theme.stampEmpty}`,
              color: isFilled ? theme.paper : theme.stampEmpty,
              fontSize: 20,
            }}
          >
            {isFilled ? "✓" : ""}
          </span>
        );
      })}
    </div>
  );
}
