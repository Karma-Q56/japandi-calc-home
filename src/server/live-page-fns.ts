import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live server functions for "Your page" and the card design (D13b2).
// The restaurant comes from the server session, never from the browser.

const span = z.object({ open: z.string().max(5), close: z.string().max(5) }).nullable();

const pageSchema = z.object({
  tagline: z.string().max(200),
  about: z.string().max(1000),
  suburb: z.string().max(200),
  address: z.string().max(500),
  hours: z.record(z.string().max(12), span),
});

const colour = z.string().max(7);
const art = z.string().max(160000);

const themeSchema = z.object({
  ink: colour,
  paper: colour,
  accent: colour,
  accentSoft: colour,
  stampFilled: colour,
  stampEmpty: colour,
  headingFont: z.string().max(40),
  bodyFont: z.string().max(40),
  radius: z.number(),
  stampShape: z.string().max(20),
  cardBackground: z.string().max(10),
  tagline: z.string().max(200),
  logoStamp: z.object({ grid: z.number(), filled: art, empty: art }).optional(),
  // Accepted so the editor can send the whole theme, then dropped by the server.
  logo: z.string().max(300).optional(),
  coverPhoto: z.string().max(10).optional(),
});

/** The signed-in restaurant's words, hours, card design and logo version, or null. */
export const getOwnerPageFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { loadOwnerPage }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-page"),
  ]);
  return loadOwnerPage(await readViewer());
});

/** Save the words and opening hours. */
export const saveOwnerPageFn = createServerFn({ method: "POST" })
  .validator(pageSchema)
  .handler(async ({ data }) => {
    const [{ readViewer }, { saveOwnerPage }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-page"),
    ]);
    return saveOwnerPage(await readViewer(), data);
  });

/** Save the card design. */
export const saveOwnerDesignFn = createServerFn({ method: "POST" })
  .validator(z.object({ theme: themeSchema }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { saveOwnerDesign }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-page"),
    ]);
    return saveOwnerDesign(await readViewer(), data.theme as never);
  });

/** Remove the logo. */
export const removeOwnerLogoFn = createServerFn({ method: "POST" }).handler(async () => {
  const [{ readViewer }, { removeOwnerLogo }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-page"),
  ]);
  return removeOwnerLogo(await readViewer());
});
