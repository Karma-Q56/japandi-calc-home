import { useState } from "react";
import { Field, Input, Select } from "@/components/patron/kit";
import { GAUTENG_SUBURBS } from "@/data/gauteng-suburbs";
import { FIND_VENUE_TYPES } from "@/lib/live-find";
import { SUBURB_MAX, VENUE_TYPE_LABELS, isListedSuburb, normaliseSuburb } from "@/lib/venue-fields";

const OTHER = "__other";

export type VenueDetails = { suburb: string; venueType: string };

/**
 * The two fields guests use to find a restaurant: the neighbourhood and the kind of place.
 * Used by Settings and Your page, live and demo. The suburb handed to onChange is always one plain string:
 * the listed name, or what the owner typed under "Somewhere else".
 */
export function VenueDetailsFields({
  suburb,
  venueType,
  onChange,
  disabled = false,
}: {
  suburb: string;
  venueType: string;
  onChange: (next: VenueDetails) => void;
  disabled?: boolean;
}) {
  const [elsewhere, setElsewhere] = useState(() => suburb.trim() !== "" && !isListedSuburb(suburb));
  const listed = isListedSuburb(suburb);
  const selected = elsewhere ? OTHER : listed ? normaliseSuburb(suburb) : "";

  return (
    <>
      <Field label="Neighbourhood">
        <Select
          value={selected}
          disabled={disabled}
          onChange={(event) => {
            const value = event.target.value;
            if (value === OTHER) {
              setElsewhere(true);
              onChange({ suburb: listed ? "" : suburb, venueType });
              return;
            }
            setElsewhere(false);
            onChange({ suburb: value, venueType });
          }}
        >
          <option value="" disabled>
            Choose a neighbourhood
          </option>
          {GAUTENG_SUBURBS.map((item) => (
            <option value={item.name} key={item.name}>
              {item.name}
            </option>
          ))}
          <option value={OTHER}>Somewhere else, I will type it</option>
        </Select>
      </Field>
      {elsewhere ? (
        <Field label="Type your neighbourhood">
          <Input
            value={suburb}
            maxLength={SUBURB_MAX}
            disabled={disabled}
            onChange={(event) => onChange({ suburb: event.target.value, venueType })}
          />
        </Field>
      ) : null}
      <Field label="What kind of place is it?" hint="Guests can find you under this type on the Find page.">
        <Select
          value={venueType}
          disabled={disabled}
          onChange={(event) => onChange({ suburb, venueType: event.target.value })}
        >
          {FIND_VENUE_TYPES.map((type) => (
            <option value={type} key={type}>
              {VENUE_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
