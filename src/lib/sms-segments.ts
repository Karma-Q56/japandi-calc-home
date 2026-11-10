// SMS segment counter (D15). Browser-safe, used by the screen and the server.
// GSM 7-bit: 160 characters in one segment, 153 per part when split.
// Any character outside GSM 7-bit switches the whole message to Unicode: 70, then 67 per part.
// Extended GSM characters (the ones that take an escape character) count as two.

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

const GSM_EXTENDED = "^{}\\[~]|€";

const BASIC = new Set(Array.from(GSM_BASIC));
const EXTENDED = new Set(Array.from(GSM_EXTENDED));

/** True when every character can be sent in the GSM 7-bit alphabet. */
export function isGsm7(text: string): boolean {
  for (const ch of text) {
    if (!BASIC.has(ch) && !EXTENDED.has(ch)) return false;
  }
  return true;
}

/** How many SMS segments the text needs. An empty text needs none. */
export function countSegments(text: string): number {
  if (text.length === 0) return 0;
  if (isGsm7(text)) {
    let units = 0;
    for (const ch of text) units += EXTENDED.has(ch) ? 2 : 1;
    return units <= 160 ? 1 : Math.ceil(units / 153);
  }
  // Unicode counts UTF-16 code units, so an emoji takes two.
  const units = text.length;
  return units <= 70 ? 1 : Math.ceil(units / 67);
}
