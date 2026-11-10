import { FilterPills } from "@/components/patron/kit";
import { FIND_VENUE_TYPES, type FindVenueType } from "@/lib/live-find";

const LABELS: Record<FindVenueType, string> = {
  cafe: "Cafes",
  bakery: "Bakeries",
  restaurant: "Restaurants",
  takeaway: "Takeaways",
  other: "Other",
};

/**
 * Venue type pills for Find. Built here but not yet placed on the Settings or
 * Your page (owned by another phase). "" means all types.
 */
export function CategoryPicker({
  value,
  onChange,
}: {
  value: FindVenueType | "";
  onChange: (type: FindVenueType | "") => void;
}) {
  const options: Array<{ value: FindVenueType | ""; label: string }> = [
    { value: "", label: "All" },
    ...FIND_VENUE_TYPES.filter((type) => type !== "other").map((type) => ({
      value: type,
      label: LABELS[type],
    })),
  ];
  return (
    <FilterPills options={options} value={value} onChange={onChange} label="Filter by type" />
  );
}
