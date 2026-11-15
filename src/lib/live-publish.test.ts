import { describe, expect, it } from "vitest";
import {
  UNPUBLISH_CONFIRM,
  firstMissingReason,
  isReady,
  publishErrorMessage,
  statusLabel,
} from "./live-publish";

describe("publish readiness wording", () => {
  it("is ready only when menu, team and suburb are all set", () => {
    expect(isReady({ hasMenu: true, hasStaff: true, hasSuburb: true })).toBe(true);
    expect(isReady({ hasMenu: true, hasStaff: true, hasSuburb: false })).toBe(false);
    expect(isReady({ hasMenu: false, hasStaff: true, hasSuburb: true })).toBe(false);
  });

  it("names the first missing condition in plain words", () => {
    expect(firstMissingReason({ hasMenu: false, hasStaff: false, hasSuburb: false })).toBe(
      "Add at least one menu item first.",
    );
    expect(firstMissingReason({ hasMenu: true, hasStaff: false, hasSuburb: true })).toBe(
      "Add a team member and pair the till first.",
    );
    expect(firstMissingReason({ hasMenu: true, hasStaff: true, hasSuburb: false })).toBe(
      "Set your suburb first.",
    );
    expect(firstMissingReason({ hasMenu: true, hasStaff: true, hasSuburb: true })).toBeNull();
  });

  it("labels each status for the owner", () => {
    expect(statusLabel("draft")).toBe("Private");
    expect(statusLabel("active")).toBe("Live");
    expect(statusLabel("paused")).toBe("Paused");
  });

  it("maps refusal codes to plain sentences and falls back safely", () => {
    expect(publishErrorMessage("not_ready")).toBe("Finish the checklist before you publish.");
    expect(publishErrorMessage("not_allowed")).toBe("Only the owner or a manager can change this.");
    expect(publishErrorMessage("bad_state")).toContain("not in the right state");
    expect(publishErrorMessage("something_unknown")).toBe(
      "We could not update your restaurant. Try again.",
    );
    expect(publishErrorMessage(null)).toBe("We could not update your restaurant. Try again.");
  });

  it("keeps the unpublish warning wording", () => {
    expect(UNPUBLISH_CONFIRM).toBe("Guests will no longer see your page or be able to join.");
  });
});
