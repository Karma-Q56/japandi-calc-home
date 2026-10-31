/**
 * PUBLIC CONTACT DETAILS - ALL PLACEHOLDERS.
 *
 * Replace every value here before launch. They feed the footer help bubble,
 * the support card and the WhatsApp links. Nothing in this file is a real
 * phone number, address or inbox. The same list is repeated under
 * "Before launch" in docs/decisions.md so nothing gets missed.
 */
export const siteDetails = {
  /** Demo address only. Use a monitored inbox before launch. */
  supportEmail: "hello@patron.example",
  /** Demo number only, digits with country code. Replace with the real WhatsApp business number. */
  whatsappNumber: "27000000000",
  /** Demo switchboard number. Replace or remove before launch. */
  phone: "+27 00 000 0000",
  /** When a real person answers. */
  supportHours: "Monday to Friday, 08:00 to 17:00",
  /** Where the team works from. */
  location: "Johannesburg, South Africa",
  /** For privacy and deletion requests. Demo address only. */
  privacyEmail: "privacy@patron.example",
} as const;

export const siteDetailsPlaceholders = [
  "supportEmail",
  "whatsappNumber",
  "phone",
  "supportHours",
  "location",
  "privacyEmail",
] as const;
