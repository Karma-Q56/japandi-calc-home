import { describe, expect, it } from "vitest";
import { joinUrl } from "@/lib/qr-links";
import { qrPdfDocument } from "@/lib/qr-pdf";

describe("QR print pack", () => {
  it("points every layout at the restaurant join page with a source tag", () => {
    expect(joinUrl("https://patron.co.za", "daily-grind", "table-tent")).toBe(
      "https://patron.co.za/r/daily-grind/join?src=table-tent",
    );
    expect(joinUrl("https://patron.co.za/", "sunrise-bakes", "square sticker")).toBe(
      "https://patron.co.za/r/sunrise-bakes/join?src=square%20sticker",
    );
    expect(joinUrl("http://localhost:3000///", "oak-table", "poster")).toBe(
      "http://localhost:3000/r/oak-table/join?src=poster",
    );
  });

  it("builds an A4 PDF with the restaurant and reward in it", () => {
    const text = qrPdfDocument({
      url: "https://patron.co.za/r/daily-grind/join?src=table-tent",
      restaurantName: "The Daily Grind",
      reward: "a free coffee",
      label: "Table tent",
      foreground: "#263a2d",
      background: "#f5f0e5",
    });
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/MediaBox [0 0 595 842]");
    expect(text).toContain("The Daily Grind");
    expect(text).toContain("Table tent");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).not.toContain("/Subtype /Image");
  });

  it("embeds the logo as a JPEG image when one is given", () => {
    const text = qrPdfDocument({
      url: "https://patron.co.za/r/daily-grind/join?src=table-tent",
      restaurantName: "The Daily Grind",
      reward: "a free coffee",
      label: "Table tent",
      foreground: "#263a2d",
      background: "#f5f0e5",
      logo: { jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 2, height: 2 },
    });
    expect(text).toContain("/Subtype /Image");
    expect(text).toContain("/DCTDecode");
    expect(text).toContain("/Im1 Do");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });
});
