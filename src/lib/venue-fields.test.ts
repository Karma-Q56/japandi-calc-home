import { describe, expect, it } from "vitest";
import {
  ADDRESS_MESSAGE,
  SUBURB_MESSAGE,
  VENUE_TYPE_MESSAGE,
  isListedSuburb,
  normaliseSuburb,
  validateAddress,
  validateSuburb,
  validateVenueType,
} from "./venue-fields";

describe("normaliseSuburb", () => {
  it("uses the official spelling ignoring case", () => {
    expect(normaliseSuburb("rosebank")).toBe("Rosebank");
    expect(normaliseSuburb("HYDE PARK")).toBe("Hyde Park");
  });
  it("trims and collapses inner spaces before matching", () => {
    expect(normaliseSuburb("   hyde    park ")).toBe("Hyde Park");
  });
  it("keeps other text as typed, only cleaned", () => {
    expect(normaliseSuburb("  Sea   Point ")).toBe("Sea Point");
    expect(normaliseSuburb("rosebank jhb")).toBe("rosebank jhb");
  });
});

describe("isListedSuburb", () => {
  it("is true for a listed name in any case and false for anything else", () => {
    expect(isListedSuburb("rosebank")).toBe(true);
    expect(isListedSuburb("Sea Point")).toBe(false);
    expect(isListedSuburb("")).toBe(false);
  });
});

describe("validateSuburb", () => {
  it("accepts normal names", () => {
    for (const ok of ["Rosebank", "Hyde Park", "St. Andrews", "O'Reilly Park", "Craighall-Park", "Ab"]) {
      expect(validateSuburb(ok), ok).toBeNull();
    }
  });
  it("refuses the wrong length and odd characters", () => {
    for (const bad of ["", "x", " x ", "R".repeat(61), "Rose<bank", "Rose;bank", "-Rosebank", "<script>"]) {
      expect(validateSuburb(bad), bad).toBe(SUBURB_MESSAGE);
    }
  });
  it("accepts exactly 60 characters", () => {
    expect(validateSuburb("R".repeat(60))).toBeNull();
  });
});

describe("validateVenueType", () => {
  it("accepts the five types", () => {
    for (const ok of ["cafe", "bakery", "restaurant", "takeaway", "other"]) expect(validateVenueType(ok)).toBeNull();
  });
  it("refuses everything else", () => {
    for (const bad of ["", "Cafe", "pub", null, undefined, 3]) expect(validateVenueType(bad)).toBe(VENUE_TYPE_MESSAGE);
  });
});

describe("validateAddress", () => {
  it("accepts an empty address and normal addresses", () => {
    for (const ok of ["", "   ", "12 Oxford Road", "Shop 4, Rosebank Mall", "1 Ox Rd"]) {
      expect(validateAddress(ok), ok).toBeNull();
    }
  });
  it("refuses web links, emails and phone numbers", () => {
    for (const bad of ["www.mysite.co.za", "visit http://x.co 12", "me@mysite.co.za 12", "0821234567", "Call 0821234567"]) {
      expect(validateAddress(bad), bad).toBe(ADDRESS_MESSAGE);
    }
  });
  it("refuses text with no digits, no letters or fewer than 5 characters", () => {
    for (const bad of ["Oxford Road", "12345", "x", "1 Ox"]) {
      expect(validateAddress(bad), bad).toBe(ADDRESS_MESSAGE);
    }
  });
  it("allows 8 digits in a row but not 9", () => {
    expect(validateAddress("Unit 12345678")).toBeNull();
    expect(validateAddress("Unit 123456789")).toBe(ADDRESS_MESSAGE);
  });
  it("honours the length cap", () => {
    expect(validateAddress(`1 ${"a".repeat(198)}`)).toBeNull();
    expect(validateAddress(`1 ${"a".repeat(199)}`)).toBe(ADDRESS_MESSAGE);
    expect(validateAddress(`1 ${"a".repeat(130)}`, 120)).toBe(ADDRESS_MESSAGE);
  });
});
