import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Live server functions for the restaurant logo (D13b).
// The restaurant comes from the server session, never from the browser.

/** The signed-in restaurant's logo version, or null when there is no logo yet. */
export const getLogoFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { loadLogo }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-logo"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return null;
  return loadLogo(viewer);
});

/** The signed-in restaurant's own logo as a data link for the owner's preview, or null. */
export const getLogoPreviewFn = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readViewer }, { loadLogoPreview }] = await Promise.all([
    import("./auth-viewer"),
    import("./live-logo"),
  ]);
  const viewer = await readViewer();
  if (!viewer) return null;
  return loadLogoPreview(viewer);
});

// The browser sends base64 bytes. The size cap stops oversized bodies before decoding.
const base64Schema = z.string().min(1).max(700 * 1024);

/** Save the converted logo (PNG and print JPEG, both base64) with checks and an audit event. */
export const saveLogoFn = createServerFn({ method: "POST" })
  .validator(z.object({ png: base64Schema, printJpeg: base64Schema }))
  .handler(async ({ data }) => {
    const [{ readViewer }, { saveLogo }] = await Promise.all([
      import("./auth-viewer"),
      import("./live-logo"),
    ]);
    const viewer = await readViewer();
    if (!viewer) return { ok: false as const, message: "Sign in to change your logo." };
    return saveLogo(
      viewer,
      new Uint8Array(Buffer.from(data.png, "base64")),
      new Uint8Array(Buffer.from(data.printJpeg, "base64")),
    );
  });
