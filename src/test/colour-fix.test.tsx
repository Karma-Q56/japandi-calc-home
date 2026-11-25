import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeEditor } from "@/components/patron/ThemeEditor";
import type { Theme } from "@/data/types";
import { DEFAULT_THEME, themeForSave, validateDesign } from "@/lib/live-page";

afterEach(cleanup);

let current: Theme;

function Harness({ live }: { live: boolean }) {
  const [theme, setTheme] = useState<Theme>({
    ...DEFAULT_THEME,
    ink: "#cccccc",
    paper: "#ffffff",
  });
  current = theme;
  return <ThemeEditor live={live} theme={theme} onChange={setTheme} name="Test Cafe" />;
}

describe.each([
  ["live", true],
  ["demo", false],
])("unreadable card colours (%s editor)", (_mode, live) => {
  it("refuses the pair, fixes it in one press and then allows the save", () => {
    render(<Harness live={live} />);
    expect(screen.getByRole("alert").textContent).toContain("too close");
    expect(validateDesign(themeForSave(current))).toMatch(/too close/);

    fireEvent.click(screen.getByRole("button", { name: "Use a readable colour" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Use a readable colour" })).toBeNull();
    expect(validateDesign(themeForSave(current))).toBeNull();
  });

  it("keeps the colour the owner just picked and changes the other one", () => {
    render(<Harness live={live} />);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "#eeeeee" } });
    fireEvent.click(screen.getByRole("button", { name: "Use a readable colour" }));
    expect(current.ink).toBe("#eeeeee");
    expect(validateDesign(themeForSave(current))).toBeNull();
  });
});
