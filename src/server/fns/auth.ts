// Auth server functions - PLACEHOLDER
// In production, these would handle authentication using Better Auth
// For now, these are simplified placeholders

import { z } from 'zod';

const staffLoginSchema = z.object({
  phone: z.string().min(1),
  pin: z.string().min(4).max(4),
});

const customerLoginSchema = z.object({
  phone: z.string().min(1),
  otp: z.string().min(6).max(6),
});

/**
 * Staff login with phone and PIN
 */
export const staffLogin = async (input: z.infer<typeof staffLoginSchema>) => {
  // In production, verify PIN against stored hash
  // Return session token on success

  console.log('[Auth] Staff login attempt:', input.phone);
  
  if (input.pin === '1234') {
    return { success: true, token: 'placeholder-token', staffId: 'placeholder-staff' };
  }

  return { success: false, error: 'Invalid PIN' };
};

/**
 * Customer login with phone and OTP
 */
export const customerLogin = async (input: z.infer<typeof customerLoginSchema>) => {
  // In production, verify OTP against stored code
  // Return session token on success

  console.log('[Auth] Customer login attempt:', input.phone);
  
  if (input.otp === '123456') {
    return { success: true, token: 'placeholder-token', customerId: 'placeholder-customer' };
  }

  return { success: false, error: 'Invalid OTP' };
};

/**
 * Send OTP for customer login
 */
export const sendOtp = async (input: { phone: string; purpose: string }) => {
  // In production, generate OTP, store it, send via SMS
  // Rate limit: 3 per 15 min, 10 per day

  console.log('[Auth] OTP sent to:', input.phone);
  return { success: true, message: 'OTP sent (placeholder)' };
};

/**
 * Validate session token
 */
export const validateSession = async (input: { token: string }) => {
  // In production, validate JWT or session token
  return { valid: true, userId: 'placeholder-user' };
};

/**
 * Logout
 */
export const logout = async () => {
  // In production, invalidate session
  return { success: true };
};
