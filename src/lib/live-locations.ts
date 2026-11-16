// Branch (location) rules shared by the live server code and the screens (D20).
// The database checks the same limits again. This file only gives clear wording before a save.

export const LOCATION_REFUSAL_CODES = [
  "plan_limit_locations",
  "main_location",
  "not_found",
  "invalid_value",
] as const;

export type LocationRefusalCode = (typeof LOCATION_REFUSAL_CODES)[number];

export type LocationInput = {
  name: string;
  address: string;
  suburb: string;
  city: string;
};

export type LocationValidation = { ok: true } | { ok: false; message: string };

export function validateLocation(input: LocationInput): LocationValidation {
  const name = input.name.trim();
  const city = input.city.trim();
  if (name.length < 1 || name.length > 80) {
    return { ok: false, message: "Give the branch a name of up to 80 letters." };
  }
  if (input.address.trim().length > 200) {
    return { ok: false, message: "The address is too long. Keep it under 200 letters." };
  }
  if (city.length < 1 || city.length > 80) {
    return { ok: false, message: "Add the city for this branch." };
  }
  return { ok: true };
}

/** Plain sentence for a refusal code from the database. */
export function locationErrorMessage(code: string | null, maxBranches?: number): string {
  switch (code) {
    case "plan_limit_locations":
      return maxBranches === 1
        ? "Your plan includes 1 branch. Ask Patron to change your plan."
        : `Your plan includes ${maxBranches ?? "this many"} branches. Ask Patron to change your plan.`;
    case "main_location":
      return "The main branch cannot be turned off. Make another branch the main one first.";
    case "invalid_value":
      return "Some details are missing or too long. Check the branch and try again.";
    case "not_found":
      return "That branch could not be found. Refresh the page and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/** The label shown for a branch in lists and pickers. */
export function branchLabel(name: string, isMain: boolean): string {
  return isMain ? `${name} (main)` : name;
}

/** Whether a plan can add another branch, given how many are active now. */
export function canAddBranch(activeCount: number, maxBranches: number): boolean {
  return activeCount < maxBranches;
}
