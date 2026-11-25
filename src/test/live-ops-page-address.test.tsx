import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The operator's "Page address" panel (D26): what the operator sees, what each button sends, and that
// nothing is sent before the confirm.

const calls = vi.hoisted(() => ({ changeSlugFn: vi.fn() }));
vi.mock("@/server/live-ops-restaurants-fns", () => ({ changeSlugFn: calls.changeSlugFn }));

import { LiveOpsPageAddress } from "@/components/patron/live/ops/LiveOpsPageAddress";
import { CHANGE_ADDRESS_WARNING, checkAddressChange } from "@/lib/live-ops-restaurants";
import { opsRefusalCode, restaurantMessageForRefusal } from "@/server/live-ops-restaurants";

const ID = "6f1c2a3e-4b5d-4e6f-8a7b-9c0d1e2f3a4b";

beforeEach(() => {
  calls.changeSlugFn.mockReset();
});
afterEach(() => cleanup());

function fill(address: string, reason: string) {
  fireEvent.change(screen.getByLabelText(/New page address/), { target: { value: address } });
  fireEvent.change(screen.getByLabelText(/Reason for the record/), { target: { value: reason } });
}

describe("LiveOpsPageAddress", () => {
  it("shows the current address", () => {
    render(<LiveOpsPageAddress restaurantId={ID} slug="the-daily-grind" />);
    expect(screen.getByText("/r/the-daily-grind")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change address" })).toBeInTheDocument();
  });

  it("refuses a bad address, the same address and a short reason without sending anything", () => {
    render(<LiveOpsPageAddress restaurantId={ID} slug="the-daily-grind" />);
    const button = screen.getByRole("button", { name: "Change address" });
    fill("Bad Address!", "Typo on the printed codes");
    fireEvent.click(button);
    expect(screen.getByRole("status")).toHaveTextContent(/3 to 40 lowercase letters/);
    fill("the-daily-grind", "Typo on the printed codes");
    fireEvent.click(button);
    expect(screen.getByRole("status")).toHaveTextContent(/already this restaurant's page address/);
    fill("daily-grind", "no");
    fireEvent.click(button);
    expect(screen.getByRole("status")).toHaveTextContent(/short reason/);
    expect(calls.changeSlugFn).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("asks first, with the warning, and sends nothing until the operator confirms", async () => {
    calls.changeSlugFn.mockResolvedValue({ ok: true, message: "Page address changed to /r/daily-grind. The old address now points to it." });
    render(<LiveOpsPageAddress restaurantId={ID} slug="the-daily-grind" />);
    fill("  Daily-Grind ", "  Typo on the printed codes ");
    fireEvent.click(screen.getByRole("button", { name: "Change address" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(CHANGE_ADDRESS_WARNING);
    expect(calls.changeSlugFn).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Yes, change the address" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Page address changed to \/r\/daily-grind/));
    expect(calls.changeSlugFn).toHaveBeenCalledWith({
      data: { restaurantId: ID, newSlug: "daily-grind", reason: "Typo on the printed codes" },
    });
    // The button label never turns into Saving or Saved.
    expect(screen.queryByText(/^Saving/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Saved/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change address" })).toBeInTheDocument();
  });

  it("can back out of the confirm", () => {
    render(<LiveOpsPageAddress restaurantId={ID} slug="the-daily-grind" />);
    fill("daily-grind", "Typo on the printed codes");
    fireEvent.click(screen.getByRole("button", { name: "Change address" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep the current address" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(calls.changeSlugFn).not.toHaveBeenCalled();
  });

  it("shows the server's plain-words refusal", async () => {
    calls.changeSlugFn.mockResolvedValue({ ok: false, message: "That web address is already in use." });
    render(<LiveOpsPageAddress restaurantId={ID} slug="the-daily-grind" />);
    fill("daily-grind", "Typo on the printed codes");
    fireEvent.click(screen.getByRole("button", { name: "Change address" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, change the address" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("That web address is already in use."));
  });

  it("shows a calm message when the call itself fails", async () => {
    calls.changeSlugFn.mockImplementation(async () => {
      throw new Error("network");
    });
    render(<LiveOpsPageAddress restaurantId={ID} slug="the-daily-grind" />);
    fill("daily-grind", "Typo on the printed codes");
    fireEvent.click(screen.getByRole("button", { name: "Change address" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, change the address" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Nothing changed/));
  });
});

describe("checkAddressChange", () => {
  it("lowercases and trims, and accepts a good change", () => {
    expect(checkAddressChange("old-one", "  New-One ", " Fix the typo ")).toEqual({ ok: true, slug: "new-one", reason: "Fix the typo" });
  });
  it("refuses short, long, odd and double dash addresses", () => {
    for (const bad of ["ab", "a".repeat(41), "has space", "double--dash", "-lead", "trail-", "under_score", ""]) {
      expect(checkAddressChange("old-one", bad, "Fix the typo").ok, bad).toBe(false);
    }
  });
});

describe("operator refusal words for page addresses", () => {
  it("reads each code by exact match and says it in plain words", () => {
    for (const code of ["bad_slug", "slug_taken", "slug_reserved", "same_slug", "bad_reason", "not_found", "not_operator"]) {
      expect(opsRefusalCode(new Error(code)), code).toBe(code);
      expect(restaurantMessageForRefusal(code), code).not.toMatch(/Something went wrong/);
    }
    expect(opsRefusalCode(new Error("slug_taken_extra"))).toBeNull();
  });
});
