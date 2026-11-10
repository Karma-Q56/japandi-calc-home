// Checks for the logo the owner uploads. The browser converts every upload to a PNG and a
// print JPEG; the server checks both before it stores them. SVG is never stored.

export const LOGO_PNG_MAX_BYTES = 512 * 1024;
export const LOGO_PRINT_MAX_BYTES = 100 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((value, index) => bytes[index] === value)
  );
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export type LogoCheck = { ok: true } | { ok: false; message: string };

export function checkLogoFiles(png: Uint8Array, printJpeg: Uint8Array): LogoCheck {
  if (png.length === 0 || printJpeg.length === 0) {
    return { ok: false, message: "Choose a logo file and try again." };
  }
  if (png.length > LOGO_PNG_MAX_BYTES) {
    return { ok: false, message: "That logo is too large after resizing. Try a simpler image." };
  }
  if (printJpeg.length > LOGO_PRINT_MAX_BYTES) {
    return { ok: false, message: "The print version of that logo is too large. Try a simpler image." };
  }
  if (!isPng(png)) return { ok: false, message: "The logo must be a real PNG image." };
  if (!isJpeg(printJpeg)) return { ok: false, message: "The print logo must be a real JPEG image." };
  return { ok: true };
}
