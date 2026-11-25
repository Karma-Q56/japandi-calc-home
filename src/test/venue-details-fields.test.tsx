import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Component tests for the neighbourhood and venue type fields (D26) and for the address message
// on the live Your page screen.

const calls = vi.hoisted(() => ({ saveOwnerPageFn: vi.fn() }));
vi.mock("@/server/live-page-fns", () => ({ saveOwnerPageFn: calls.saveOwnerPageFn }));
vi.mock("@/server/live-logo-fns", () => ({ getLogoPreviewFn: vi.fn().mockResolvedValue(null) }));
vi.mock("@/components/patron/live/PageIdentity", () => ({ PageIdentity: () => null }));

import { VenueDetailsFields, type VenueDetails } from "@/components/patron/VenueDetailsFields";
import { LivePage } from "@/components/patron/live/LivePage";
import { ADDRESS_MESSAGE } from "@/lib/venue-fields";
import type { OwnerPage } from "@/server/live-page";

beforeEach(() => {
  calls.saveOwnerPageFn.mockReset();
});
afterEach(() => cleanup());

function Harness(props: { suburb: string; venueType: string; disabled?: boolean; seen: VenueDetails[] }) {
  const [value, setValue] = useState<VenueDetails>({ suburb: props.suburb, venueType: props.venueType });
  return (
    <VenueDetailsFields
      suburb={value.suburb}
      venueType={value.venueType}
      disabled={props.disabled ?? false}
      onChange={(next) => {
        props.seen.push(next);
        setValue(next);
      }}
    />
  );
}

describe("VenueDetailsFields", () => {
  it("selects a listed neighbourhood and shows no text box", () => {
    render(<Harness suburb="Rosebank" venueType="cafe" seen={[]} />);
    expect(screen.getByLabelText("Neighbourhood")).toHaveValue("Rosebank");
    expect(screen.queryByLabelText("Type your neighbourhood")).not.toBeInTheDocument();
  });

  it("matches a listed neighbourhood ignoring case and spaces", () => {
    render(<Harness suburb="  hyde  park " venueType="cafe" seen={[]} />);
    expect(screen.getByLabelText("Neighbourhood")).toHaveValue("Hyde Park");
  });

  it("starts on Somewhere else with the saved text when the neighbourhood is not in the list", () => {
    render(<Harness suburb="Sea Point" venueType="cafe" seen={[]} />);
    expect(screen.getByLabelText("Neighbourhood")).toHaveValue("__other");
    expect(screen.getByLabelText("Type your neighbourhood")).toHaveValue("Sea Point");
  });

  it("offers a disabled first option, and the last option is Somewhere else", () => {
    render(<Harness suburb="" venueType="other" seen={[]} />);
    const select = screen.getByLabelText("Neighbourhood") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(select.options[0]).toHaveTextContent("Choose a neighbourhood");
    expect(select.options[0]!.disabled).toBe(true);
    expect(select.options[select.options.length - 1]).toHaveTextContent("Somewhere else, I will type it");
  });

  it("always hands one plain string to onChange: a listed name, or what was typed", () => {
    const seen: VenueDetails[] = [];
    render(<Harness suburb="Rosebank" venueType="cafe" seen={seen} />);
    fireEvent.change(screen.getByLabelText("Neighbourhood"), { target: { value: "Sandton" } });
    expect(seen.at(-1)).toEqual({ suburb: "Sandton", venueType: "cafe" });
    fireEvent.change(screen.getByLabelText("Neighbourhood"), { target: { value: "__other" } });
    expect(screen.getByLabelText("Type your neighbourhood")).toBeInTheDocument();
    expect(seen.at(-1)).toEqual({ suburb: "", venueType: "cafe" });
    fireEvent.change(screen.getByLabelText("Type your neighbourhood"), { target: { value: "Sea Point" } });
    expect(seen.at(-1)).toEqual({ suburb: "Sea Point", venueType: "cafe" });
    // Going back to the list hides the text box again.
    fireEvent.change(screen.getByLabelText("Neighbourhood"), { target: { value: "Melville" } });
    expect(screen.queryByLabelText("Type your neighbourhood")).not.toBeInTheDocument();
    expect(seen.at(-1)).toEqual({ suburb: "Melville", venueType: "cafe" });
  });

  it("limits the typed neighbourhood to 60 characters", () => {
    render(<Harness suburb="Sea Point" venueType="cafe" seen={[]} />);
    expect(screen.getByLabelText("Type your neighbourhood")).toHaveAttribute("maxlength", "60");
  });

  it("has the five kinds of place with the hint, and passes the choice on", () => {
    const seen: VenueDetails[] = [];
    render(<Harness suburb="Rosebank" venueType="other" seen={seen} />);
    const select = screen.getByLabelText(/What kind of place is it\?/) as HTMLSelectElement;
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ["cafe", "Cafe"],
      ["bakery", "Bakery"],
      ["restaurant", "Restaurant"],
      ["takeaway", "Takeaway"],
      ["other", "Other"],
    ]);
    expect(screen.getByText("Guests can find you under this type on the Find page.")).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "bakery" } });
    expect(seen.at(-1)).toEqual({ suburb: "Rosebank", venueType: "bakery" });
  });

  it("disables every control when disabled", () => {
    render(<Harness suburb="Sea Point" venueType="cafe" seen={[]} disabled />);
    expect(screen.getByLabelText("Neighbourhood")).toBeDisabled();
    expect(screen.getByLabelText("Type your neighbourhood")).toBeDisabled();
    expect(screen.getByLabelText(/What kind of place is it\?/)).toBeDisabled();
  });
});

const hours = {
  Monday: { open: "07:00", close: "16:00" },
  Tuesday: null,
  Wednesday: null,
  Thursday: null,
  Friday: null,
  Saturday: null,
  Sunday: null,
};

const page = (over: Partial<OwnerPage> = {}): OwnerPage =>
  ({
    name: "Corner Cafe",
    slug: "corner-cafe",
    status: "active",
    tagline: "Good coffee",
    about: "",
    suburb: "Melville",
    venueType: "cafe",
    address: "",
    hours,
    theme: {},
    logoVersion: null,
    ...over,
  }) as unknown as OwnerPage;

describe("live Your page screen: address and venue details", () => {
  it("shows the address message when the field is left with a phone number", () => {
    render(<LivePage page={page()} />);
    const address = screen.getByLabelText(/Street address/);
    fireEvent.change(address, { target: { value: "0821234567" } });
    fireEvent.blur(address);
    expect(screen.getByRole("alert")).toHaveTextContent(ADDRESS_MESSAGE);
  });

  it("does not save a bad address and says why", () => {
    render(<LivePage page={page({ address: "www.mysite.co.za" })} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(calls.saveOwnerPageFn).not.toHaveBeenCalled();
    expect(screen.getAllByText(ADDRESS_MESSAGE).length).toBeGreaterThan(0);
  });

  it("sends the venue type and neighbourhood with the rest of the page", async () => {
    calls.saveOwnerPageFn.mockResolvedValue({ ok: true });
    render(<LivePage page={page({ address: "12 Oxford Road" })} />);
    fireEvent.change(screen.getByLabelText(/What kind of place is it\?/), { target: { value: "bakery" } });
    fireEvent.change(screen.getByLabelText("Neighbourhood"), { target: { value: "Rosebank" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(calls.saveOwnerPageFn).toHaveBeenCalled());
    const input = calls.saveOwnerPageFn.mock.calls[0]![0].data;
    expect(input).toMatchObject({ venueType: "bakery", suburb: "Rosebank", address: "12 Oxford Road" });
  });
});
