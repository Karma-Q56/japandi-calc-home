import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SectionTabs } from "@/components/patron/kit/SectionTabs";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    search: _search,
    ...rest
  }: {
    to: string;
    children: ReactNode;
    search?: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const BUTTONS = [
  { id: "a", label: "All guests" },
  { id: "b", label: "Lists" },
  { id: "c", label: "Birthdays" },
];

describe("SectionTabs", () => {
  it("renders links with the open page marked and the list named", () => {
    render(
      <SectionTabs
        label="In this section"
        active="/app/team"
        tabs={[
          { id: "/app/settings", href: "/app/settings", label: "Details" },
          { id: "/app/team", href: "/app/team", label: "Team" },
        ]}
      />,
    );
    expect(screen.getByRole("navigation", { name: "In this section" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Team" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Details" }).hasAttribute("aria-current")).toBe(false);
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("renders a named tab list with one selected tab", () => {
    const onSelect = vi.fn();
    render(<SectionTabs label="Guest views" active="b" tabs={BUTTONS} onSelect={onSelect} />);
    expect(screen.getByRole("tablist", { name: "Guest views" })).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.click(tabs[2]!);
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("moves focus with the arrow, Home and End keys, wrapping at the ends", () => {
    const onSelect = vi.fn();
    render(<SectionTabs label="Guest views" active="a" tabs={BUTTONS} onSelect={onSelect} />);
    const [first, second, third] = screen.getAllByRole("tab") as HTMLElement[];
    first!.focus();
    const press = (key: string) => fireEvent.keyDown(document.activeElement!, { key });
    press("ArrowRight");
    expect(document.activeElement).toBe(second);
    press("End");
    expect(document.activeElement).toBe(third);
    press("ArrowRight");
    expect(document.activeElement).toBe(first);
    press("ArrowLeft");
    expect(document.activeElement).toBe(third);
    press("Home");
    expect(document.activeElement).toBe(first);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("lets a mixed bar switch in place and link away", () => {
    const onSelect = vi.fn();
    render(
      <SectionTabs
        label="Loyalty sections"
        active="stamp"
        onSelect={onSelect}
        tabs={[
          { id: "stamp", label: "Stamp card" },
          { id: "rewards", label: "Rewards" },
          { id: "challenges", href: "/app/challenges", label: "Challenges" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Stamp card" }).getAttribute("aria-current")).toBe(
      "page",
    );
    fireEvent.click(screen.getByRole("button", { name: "Rewards" }));
    expect(onSelect).toHaveBeenCalledWith("rewards");
    expect(screen.getByRole("link", { name: "Challenges" }).getAttribute("href")).toBe(
      "/app/challenges",
    );
  });
});
