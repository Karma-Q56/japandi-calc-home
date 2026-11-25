import { FormField } from "@/components/patron/dash";

export type TimeInput = { open: string; close: string } | null;

export function TimeEditor({
  span,
  day,
  onChange,
}: {
  span: TimeInput;
  day: string;
  onChange: (next: TimeInput) => void;
}) {
  const closed = span === null;
  return (
    <div className="menu-owner-row hours-row" key={day}>
      <div>
        <strong>{day}</strong>
        {closed && <small>Closed</small>}
      </div>
      <div className="menu-row-actions">
        <FormField label="Opens">
          <input
            type="time"
            value={span?.open ?? ""}
            aria-label={`${day} opening time`}
            disabled={closed}
            onChange={(event) =>
              onChange({ open: event.target.value, close: span?.close ?? "" })
            }
          />
        </FormField>
        <FormField label="Closes">
          <input
            type="time"
            value={span?.close ?? ""}
            aria-label={`${day} closing time`}
            disabled={closed}
            onChange={(event) =>
              onChange({ close: event.target.value, open: span?.open ?? "" })
            }
          />
        </FormField>
        <button className="row-action" onClick={() => onChange(closed ? { open: "07:00", close: "16:00" } : null)}>
          {closed ? "Set hours" : "Closed that day"}
        </button>
      </div>
    </div>
  );
}
