// Phone number normalization and validation for South African numbers

const SA_COUNTRY_CODE = '+27';
const SA_COUNTRY_CODE_DIGITS = '27';
const SA_NATIONAL_PREFIX = '0';

/**
 * Normalize a phone number to E.164 format for South Africa
 * Accepts: +27821234567, 0821234567, 821234567, 0027821234567, +27 82 123 4567
 * Returns: +27821234567 or null if invalid
 */
export function normalizePhone(input: string): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  // Remove all non-digit characters except leading +
  let cleaned = input.replace(/[^\d+]/g, '');

  // Handle international prefix 00
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }

  // Handle + prefix
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // Remove any remaining non-digits
  cleaned = cleaned.replace(/\D/g, '');

  // Check length - South African numbers are 9 digits (without country code)
  // With country code: 27 + 9 digits = 11 digits
  if (cleaned.length === 9) {
    // Assume South African number without country code
    return SA_COUNTRY_CODE + cleaned;
  }

  if (cleaned.length === 11 && cleaned.startsWith(SA_COUNTRY_CODE_DIGITS)) {
    // Already has country code
    return SA_COUNTRY_CODE + cleaned.substring(2);
  }

  if (cleaned.length === 10 && cleaned.startsWith(SA_NATIONAL_PREFIX)) {
    // South African number with national prefix 0
    return SA_COUNTRY_CODE + cleaned.substring(1);
  }

  // Try to detect and fix common patterns
  // If it's 10 digits starting with 0, it's a national format
  if (cleaned.length === 10 && cleaned[0] === '0') {
    return SA_COUNTRY_CODE + cleaned.substring(1);
  }

  // If it's 9 digits, add country code
  if (cleaned.length === 9) {
    return SA_COUNTRY_CODE + cleaned;
  }

  // If it's 11 digits starting with 27, it's already in E.164 format without +
  if (cleaned.length === 11 && cleaned.startsWith('27')) {
    return SA_COUNTRY_CODE + cleaned.substring(2);
  }

  return null;
}

/**
 * Validate that a phone number is a valid South African mobile number
 * South African mobile numbers start with:
 * - 082 (Vodacom)
 * - 083 (MTN)
 * - 084 (Cell C)
 * - 072 (MTN)
 * - 073 (Cell C)
 * - 074 (Vodacom)
 * - 076 (Cell C)
 * - 078 (Telkom Mobile)
 * - 079 (Vodacom)
 */
export function isValidSAMobile(number: string): boolean {
  const normalized = normalizePhone(number);
  if (!normalized) {
    return false;
  }

  // Extract the national significant number (without +27)
  const nationalNumber = normalized.substring(3);

  // Check if it starts with a valid mobile prefix
  const mobilePrefixes = ['82', '83', '84', '72', '73', '74', '76', '78', '79'];
  
  const firstTwoDigits = nationalNumber.substring(0, 2);
  return mobilePrefixes.includes(firstTwoDigits);
}

/**
 * Check if a phone number is a landline (not valid for SMS)
 */
export function isLandline(number: string): boolean {
  const normalized = normalizePhone(number);
  if (!normalized) {
    return false;
  }

  const nationalNumber = normalized.substring(3);
  
  // Landline prefixes in South Africa
  const landlinePrefixes = [
    '10', '11', '12', '13', '14', '15', '16', '17', '18', // Geographic numbers
    '21', '22', '23', '24', '25', '26', '27', '28',
    '31', '32', '33', '34', '35', '36', '37', '38', '39',
    '41', '42', '43', '44', '45', '46', '47', '48', '49',
    '51', '52', '53', '54', '55', '56', '57', '58', '59',
  ];
  
  const firstTwoDigits = nationalNumber.substring(0, 2);
  return landlinePrefixes.includes(firstTwoDigits);
}

/**
 * Hash a phone number for rate limiting (SHA-256)
 * Uses Web Crypto API
 */
export async function hashPhone(phone: string): Promise<string> {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return '';
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash an IP address for rate limiting
 */
export async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Format a phone number for display (masked)
 * Example: +27821234567 -> +27 82 *** 4567
 */
export function maskPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return phone;
  }

  // +27821234567 -> +27 82 *** 4567
  const nationalNumber = normalized.substring(3);
  if (nationalNumber.length < 7) {
    return normalized;
  }

  const prefix = nationalNumber.substring(0, 2);
  const suffix = nationalNumber.substring(nationalNumber.length - 4);
  return `+27 ${prefix} *** ${suffix}`;
}

/**
 * Generate a random OTP code (6 digits)
 */
export function generateOtp(): string {
  const array = new Uint8Array(3);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  
  let otp = '';
  for (let i = 0; i < 3; i++) {
    // Generate a random number between 0 and 999, pad to 3 digits
    const num = array[i]! % 1000;
    otp += num.toString().padStart(3, '0');
  }
  
  // Take first 6 digits
  return otp.substring(0, 6);
}

/**
 * Check if a phone number is a test number (accepts fixed OTP)
 * Test numbers: +27000000xxx (any number starting with +27000)
 */
export function isTestPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return false;
  }
  return normalized.startsWith('+27000');
}
