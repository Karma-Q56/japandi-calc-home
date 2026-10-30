// SMS segment counting per GSM specifications

// GSM-7 basic character set (160 chars single, 153 per part in multipart)
const GSM_7_CHARS = new Set([
  '@', '\u00a3', '$', '\u00a5', '\u00e8', '\u00e9', '\u00f9', '\u00ec', '\u00f2', '\u00c7',
  '\n', '\r', '\t', ' ', '!', '"', '#', '\u00a4', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';', '<', '=', '>', '?',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
  'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '\u00c4', '\u00d6', '\u00d1', '\u00dc', '\u00a7',
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p',
  'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '\u00e4', '\u00f6', '\u00f1', '\u00fc', '\u00e0',
]);

// GSM-7 extension characters (count as 2 characters each in GSM-7 encoding)
// These are: ^ { } \ [ ~ ] | \u20ac
const GSM_7_EXTENSION_CHARS = new Set(['^', '{', '}', '\\', '[', '~', ']', '|', '\u20ac']);

/**
 * Check if a character is in the GSM-7 basic set
 */
function isGsm7Basic(char: string): boolean {
  return GSM_7_CHARS.has(char);
}

/**
 * Check if a character is a GSM-7 extension character
 */
function isGsm7Extension(char: string): boolean {
  return GSM_7_EXTENSION_CHARS.has(char);
}

/**
 * Check if a character is in GSM-7 (basic or extension)
 */
function isGsm7(char: string): boolean {
  return isGsm7Basic(char) || isGsm7Extension(char);
}

/**
 * Count the number of SMS segments required for a message
 * 
 * Rules:
 * - GSM-7 basic: 160 chars = 1 segment, 153 chars per additional segment
 * - GSM-7 with extension chars: each extension char counts as 2, so effective limit is lower
 * - Any non-GSM-7 char (emoji, Unicode): UCS-2 encoding, 70 chars = 1 segment, 67 per additional
 */
export function countSegments(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  // Check if the entire message can use GSM-7
  let usesGsm7 = true;
  let extensionCharCount = 0;

  for (const char of text) {
    if (!isGsm7(char)) {
      usesGsm7 = false;
      break;
    }
    if (isGsm7Extension(char)) {
      extensionCharCount++;
    }
  }

  if (usesGsm7) {
    // GSM-7 encoding. Each extension char counts as 2 septets, and every
    // segment of a multipart message holds 153 septets (SPEC 9.2 vectors:
    // 160 -> 1, 161 -> 2, 306 -> 2, 307 -> 3).
    const effectiveLength = text.length + extensionCharCount;
    if (effectiveLength <= 160) {
      return 1;
    }
    return Math.ceil(effectiveLength / 153);
  } else {
    // UCS-2 encoding (Unicode), counted in code points per SPEC 9.2:
    // 70 chars = 1 segment, 67 chars per additional segment.
    const length = [...text].length;
    if (length <= 70) {
      return 1;
    }
    return 1 + Math.ceil((length - 70) / 67);
  }
}

/**
 * Check if a message contains any non-GSM-7 characters
 */
export function hasNonGsm7(text: string): boolean {
  for (const char of text) {
    if (!isGsm7(char)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a message contains GSM-7 extension characters
 */
export function hasGsm7Extension(text: string): boolean {
  for (const char of text) {
    if (isGsm7Extension(char)) {
      return true;
    }
  }
  return false;
}

/**
 * Replace smart quotes and other problematic characters with GSM-7 equivalents
 * Returns the sanitized text and whether it was modified
 */
export function sanitizeForGsm7(text: string): { text: string; modified: boolean } {
  const replacements: Record<string, string> = {
    '\u201c': '"', // Left double quote
    '\u201d': '"', // Right double quote
    '\u2018': "'", // Left single quote
    '\u2019': "'", // Right single quote
    '\u2026': '...', // Ellipsis
    '\u2013': '-', // En dash
    '\u2014': '-', // Em dash
    '\u20ac': 'EUR', // Euro symbol
  };

  let modified = false;
  let result = text;

  for (const [from, to] of Object.entries(replacements)) {
    if (result.includes(from)) {
      result = result.replace(new RegExp(from, 'g'), to);
      modified = true;
    }
  }

  return { text: result, modified };
}

// Test vectors from SPEC
export const SEGMENT_TEST_VECTORS = [
  { input: 'a'.repeat(160), expected: 1, description: '160 GSM-7 basic chars = 1 segment' },
  { input: 'a'.repeat(161), expected: 2, description: '161 GSM-7 basic chars = 2 segments' },
  { input: 'a'.repeat(306), expected: 2, description: '306 GSM-7 basic chars = 2 segments' },
  { input: 'a'.repeat(307), expected: 3, description: '307 GSM-7 basic chars = 3 segments' },
  { input: '\ud83d\ude00', expected: 1, description: 'Single emoji = 1 UCS-2 segment' },
  { input: '\ud83d\ude00'.repeat(70), expected: 1, description: '70 UCS-2 chars = 1 segment' },
  { input: '\ud83d\ude00'.repeat(71), expected: 2, description: '71 UCS-2 chars = 2 segments' },
] as const;
