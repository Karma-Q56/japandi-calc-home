export function validateSectionName(name: string) {
  const value = name.trim();
  if (value.length < 1 || value.length > 80) {
    return { ok: false as const, message: "A section name must be 1 to 80 characters." };
  }
  return { ok: true as const, name: value };
}

export function validateMenuItem(input: {
  name: string;
  description: string;
  priceCents: number;
}) {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 120) {
    return { ok: false as const, message: "An item name must be 1 to 120 characters." };
  }
  const description = input.description.trim();
  if (description.length > 300) {
    return { ok: false as const, message: "Keep the item description under 300 characters." };
  }
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) {
    return { ok: false as const, message: "Enter a price of zero or more." };
  }
  return { ok: true as const, name, description };
}
