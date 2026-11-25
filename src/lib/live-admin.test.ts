import { describe, expect, it } from "vitest";
import {
  activityActor,
  activityWording,
  adminErrorMessage,
  checkCampaignNote,
  checkFeedback,
  checkHelpDays,
  checkIdea,
  checkSettings,
  type SettingsInput,
} from "./live-admin";

const good: SettingsInput = {
  name: " Corner Café ",
  phone: "021 555 0100",
  address: "12 Main Road",
  suburb: "Observatory",
  venueType: "cafe",
  city: "Cape Town",
  enquiryEmail: "hello@example.com",
  offersAlerts: true,
  ordersAtTill: false,
  marketingWeeklyCap: 3,
  memberWeeklyCap: 2,
};

describe("checkSettings", () => {
  it("trims values and accepts a good set", () => {
    const result = checkSettings(good);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe("Corner Café");
  });

  it("refuses an empty name or city", () => {
    expect(checkSettings({ ...good, name: "   " })).toMatchObject({ ok: false, field: "name" });
    expect(checkSettings({ ...good, city: "" })).toMatchObject({ ok: false, field: "city" });
  });

  it("refuses a bad phone and a bad enquiry email", () => {
    expect(checkSettings({ ...good, phone: "call me" })).toMatchObject({ ok: false, field: "phone" });
    expect(checkSettings({ ...good, enquiryEmail: "not-an-email" })).toMatchObject({
      ok: false,
      field: "enquiryEmail",
    });
  });

  it("allows an empty phone and an empty enquiry email", () => {
    expect(checkSettings({ ...good, phone: "", enquiryEmail: "" }).ok).toBe(true);
  });

  it("keeps message limits between 0 and 14 whole numbers", () => {
    expect(checkSettings({ ...good, marketingWeeklyCap: 15 })).toMatchObject({
      ok: false,
      field: "marketingWeeklyCap",
    });
    expect(checkSettings({ ...good, memberWeeklyCap: -1 })).toMatchObject({
      ok: false,
      field: "memberWeeklyCap",
    });
    expect(checkSettings({ ...good, memberWeeklyCap: 1.5 })).toMatchObject({
      ok: false,
      field: "memberWeeklyCap",
    });
    expect(checkSettings({ ...good, marketingWeeklyCap: 0, memberWeeklyCap: 14 }).ok).toBe(true);
  });
});

describe("checkFeedback", () => {
  it("accepts a known category and a message of 10 to 1000 characters", () => {
    expect(checkFeedback("broken", "The till stopped after lunch.").ok).toBe(true);
  });

  it("refuses an unknown category or a short message", () => {
    expect(checkFeedback("praise", "Lovely work on this one").ok).toBe(false);
    expect(checkFeedback("other", "short").ok).toBe(false);
    expect(checkFeedback("other", "x".repeat(1001)).ok).toBe(false);
  });
});

describe("checkIdea and checkCampaignNote", () => {
  it("needs a place and keeps the note short", () => {
    expect(checkIdea("", "")).toMatchObject({ ok: false });
    expect(checkIdea("Bo-Kaap Bakery", "")).toEqual({ ok: true, place: "Bo-Kaap Bakery", note: null });
    expect(checkIdea("Bakery", "x".repeat(281)).ok).toBe(false);
  });

  it("needs 10 to 500 characters for a campaign request", () => {
    expect(checkCampaignNote("too short").ok).toBe(false);
    expect(checkCampaignNote("Tell guests about the new lunch menu.").ok).toBe(true);
    expect(checkCampaignNote("x".repeat(501)).ok).toBe(false);
  });
});

describe("checkHelpDays", () => {
  it("allows only 1, 7, 14 and 30 days", () => {
    expect([1, 7, 14, 30].every(checkHelpDays)).toBe(true);
    expect(checkHelpDays(3)).toBe(false);
    expect(checkHelpDays(0)).toBe(false);
  });
});

describe("activity wording and errors", () => {
  it("gives plain words for known actions and a safe default for unknown ones", () => {
    expect(activityWording("settings_changed")).toBe("You changed your settings");
    expect(activityWording("some_new_thing")).toBe("Something was changed in your restaurant");
  });

  it("never shows ids in the actor label", () => {
    expect(activityActor("owner")).toBe("You");
    expect(activityActor("staff")).toBe("Team member");
    expect(activityActor("weird")).toBe("Someone");
  });

  it("maps refusal codes to owner words", () => {
    expect(adminErrorMessage("not_allowed")).toContain("owner or a manager");
    expect(adminErrorMessage("rate_limited")).toContain("Try again tomorrow");
    expect(adminErrorMessage(null)).toBe("Something went wrong. Please try again.");
  });
});

describe("checkSettings venue details (D26)", () => {
  it("normalises a listed neighbourhood to its official spelling", () => {
    const result = checkSettings({ ...good, suburb: "  rosebank " });
    expect(result.ok && result.value.suburb).toBe("Rosebank");
  });

  it("refuses an address that is a web link, an email or a phone number", () => {
    for (const address of ["www.mysite.co.za", "me@x.co 12", "0821234567", "Oxford Road"]) {
      const result = checkSettings({ ...good, address });
      expect(result.ok, address).toBe(false);
      if (!result.ok) expect(result.field).toBe("address");
    }
  });

  it("allows an empty address", () => {
    expect(checkSettings({ ...good, address: "" }).ok).toBe(true);
  });

  it("refuses a neighbourhood with odd characters", () => {
    const result = checkSettings({ ...good, suburb: "Rose<bank" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("suburb");
  });

  it("refuses a venue type that is not one of the five", () => {
    const result = checkSettings({ ...good, venueType: "pub" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("venueType");
  });
});
