// Plain wording, validation and error messages for the owner admin screens (phase D13a).
// Browser-safe: no database or server imports.

export const ADMIN_REFUSAL_CODES = ["not_allowed", "invalid_value", "rate_limited"] as const;
export type AdminRefusalCode = (typeof ADMIN_REFUSAL_CODES)[number];

export function adminErrorMessage(code: string | null): string {
  switch (code) {
    case "not_allowed":
      return "Only the owner or a manager can change this. Ask them to do it.";
    case "invalid_value":
      return "Check the highlighted details and try again.";
    case "rate_limited":
      return "You have sent a lot today. Try again tomorrow.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export const ACTIVITY_PAGE_SIZE = 50;

/** Plain wording for each audit action. Unknown actions fall back to a safe sentence. */
const ACTIVITY_WORDING: Record<string, string> = {
  restaurant_created: "Your restaurant was set up",
  restaurant_created_for_owner: "Patron set up your restaurant",
  restaurant_published: "You published your restaurant",
  restaurant_unpublished: "You took your restaurant offline",
  restaurant_listing_changed: "You changed whether your restaurant shows in Find",
  restaurant_status_changed: "Patron changed your restaurant's status",
  restaurant_plan_changed: "Patron changed your plan",
  restaurant_details_changed: "You changed your business name or phone number",
  settings_changed: "You changed your settings",
  page_changed: "You changed your public page words or opening hours",
  design_changed: "You changed your card design",
  spin_changed: "You changed your spin wheel",
  logo_updated: "You changed your logo",
  logo_removed: "You removed your logo",
  credit_added: "Patron added credit to your account",
  low_credit_alert: "Your credit is running low. Top up so your campaigns can send",
  campaign_approved: "Patron approved a campaign",
  campaign_rejected: "Patron did not approve a campaign",
  "special.redeemed": "A special was redeemed at the till",
  feedback_received: "You sent feedback to Patron",
  idea_received: "You asked for a place on Patron",
  sign_in: "Someone signed in at the till",
  stamp: "A stamp was added to a card",
  undo: "A stamp was undone",
  redeem: "A reward was redeemed",
  pin_reset: "A till PIN was reset",
  pairing: "A till was paired",
  pin_failure: "A wrong PIN was entered at the till",
  lockout: "A till was locked after wrong PINs",
};

export function activityWording(action: string): string {
  return ACTIVITY_WORDING[action] ?? "Something was changed in your restaurant";
}

/** Who did it, in plain words. Never shows a user id or email. */
export function activityActor(actorType: string): string {
  switch (actorType) {
    case "owner":
      return "You";
    case "staff":
      return "Team member";
    case "operator":
      return "Patron";
    case "customer":
      return "Guest";
    case "system":
      return "Patron";
    default:
      return "Someone";
  }
}

export type SettingsInput = {
  name: string;
  phone: string;
  address: string;
  suburb: string;
  city: string;
  enquiryEmail: string;
  offersAlerts: boolean;
  ordersAtTill: boolean;
  marketingWeeklyCap: number;
  memberWeeklyCap: number;
};

export type SettingsCheck = { ok: true; value: SettingsInput } | { ok: false; field: keyof SettingsInput; message: string };

const PHONE = /^[0-9+ ()-]{7,20}$/;
const EMAIL = /^[^@ ]+@[^@ ]+\.[^@ ]+$/;

/** Checks the settings before they reach the database. The database checks again. */
export function checkSettings(input: SettingsInput): SettingsCheck {
  const value: SettingsInput = {
    name: input.name.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    suburb: input.suburb.trim(),
    city: input.city.trim(),
    enquiryEmail: input.enquiryEmail.trim(),
    offersAlerts: input.offersAlerts,
    ordersAtTill: input.ordersAtTill,
    marketingWeeklyCap: input.marketingWeeklyCap,
    memberWeeklyCap: input.memberWeeklyCap,
  };
  if (!Number.isInteger(value.marketingWeeklyCap) || value.marketingWeeklyCap < 0 || value.marketingWeeklyCap > 14) {
    return { ok: false, field: "marketingWeeklyCap", message: "Use a number from 0 to 14 for messages to guests each week." };
  }
  if (!Number.isInteger(value.memberWeeklyCap) || value.memberWeeklyCap < 0 || value.memberWeeklyCap > 14) {
    return { ok: false, field: "memberWeeklyCap", message: "Use a number from 0 to 14 for messages to members each week." };
  }
  if (value.name.length < 1 || value.name.length > 80) {
    return { ok: false, field: "name", message: "Add your business name (up to 80 characters)." };
  }
  if (value.city.length < 1 || value.city.length > 80) {
    return { ok: false, field: "city", message: "Add your city (up to 80 characters)." };
  }
  if (value.phone && !PHONE.test(value.phone)) {
    return { ok: false, field: "phone", message: "Use a phone number with 7 to 20 digits, spaces, + or brackets." };
  }
  if (value.address.length > 160) {
    return { ok: false, field: "address", message: "Keep the address under 160 characters." };
  }
  if (value.enquiryEmail && (value.enquiryEmail.length > 120 || !EMAIL.test(value.enquiryEmail))) {
    return { ok: false, field: "enquiryEmail", message: "Use an email address like name@example.com." };
  }
  return { ok: true, value };
}

export type FeedbackCheck = { ok: true; category: string; message: string } | { ok: false; message: string };
export const FEEDBACK_CATEGORIES = ["broken", "feature", "confusing", "other"] as const;

export function checkFeedback(category: string, message: string): FeedbackCheck {
  if (!(FEEDBACK_CATEGORIES as readonly string[]).includes(category)) {
    return { ok: false, message: "Choose what kind of feedback this is." };
  }
  const text = message.trim();
  if (text.length < 10 || text.length > 1000) {
    return { ok: false, message: "Write between 10 and 1000 characters." };
  }
  return { ok: true, category, message: text };
}

/** Checks the note on a done-for-you campaign request. */
export function checkCampaignNote(note: string): { ok: true; note: string } | { ok: false; message: string } {
  const text = note.trim();
  if (text.length < 10 || text.length > 500) {
    return { ok: false, message: "Tell us what you want the campaign to say (between 10 and 500 characters)." };
  }
  return { ok: true, note: text };
}

/** Help from Patron days. Only these choices are allowed (see src/domain/help.ts). */
export const HELP_DAYS = [1, 7, 14, 30] as const;

export function checkHelpDays(days: number): boolean {
  return (HELP_DAYS as readonly number[]).includes(days);
}

export function checkIdea(place: string, note: string): { ok: true; place: string; note: string | null } | { ok: false; message: string } {
  const placeText = place.trim();
  const noteText = note.trim();
  if (placeText.length < 1 || placeText.length > 120) {
    return { ok: false, message: "Tell us which place you would like on Patron (up to 120 characters)." };
  }
  if (noteText.length > 280) {
    return { ok: false, message: "Keep the note under 280 characters." };
  }
  return { ok: true, place: placeText, note: noteText || null };
}
