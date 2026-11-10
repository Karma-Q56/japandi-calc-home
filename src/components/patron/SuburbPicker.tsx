import { Select, Field } from "@/components/patron/kit";
import { GAUTENG_SUBURBS } from "@/data/gauteng-suburbs";

/**
 * Neighbourhood picker for Find. Built here but not yet placed on the
 * Settings or Your page (owned by another phase).
 */
export function SuburbPicker({
  value,
  onChange,
  label = "Neighbourhood",
  allLabel = "All neighbourhoods",
}: {
  value: string;
  onChange: (suburb: string) => void;
  label?: string;
  allLabel?: string;
}) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {GAUTENG_SUBURBS.map((suburb) => (
          <option value={suburb.name} key={suburb.name}>
            {suburb.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
