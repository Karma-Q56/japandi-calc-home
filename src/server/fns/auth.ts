// Auth server functions
// Note: Better Auth integration is deferred per user instruction
// These are placeholder functions that will be implemented when auth is enabled

import { z } from 'zod';
import { createServerFn } from '@tanstack/react-start';
import { withContext } from '../db';
import { getSmsProvider } from '../sms';
import { normalizePhone, isValidSAMobile, isTestPhone } from '@/lib/phone';
import { APP_ENV, IS_DEVELOPMENT, RATE_LIMITS } from '@/config/app';
import { sql } from 'drizzle-orm';

// Input validation schemas
const sendOtpSchema = z.object({
  phone: z.string().min(1),
  ip: z.string().optional(),
  purpose: z.enum(['login', 'join', 'verify']).default('login'),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(1),
  code: z.string().length(6),
  purpose: z.enum(['login', 'join', 'verify']).default('login'),
});

/**
 * Send OTP - placeholder implementation
 * In production, this will integrate with Better Auth
 */
export const sendOtp = createServerFn({
  method: 'POST',
  input: sendOtpSchema,
  async handler({ input }) {
    const { phone, ip, purpose } = input;

    // Normalize phone
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return { error: 'Invalid phone number format' };
    }

    // Validate South African mobile
    if (!isValidSAMobile(normalizedPhone)) {
      return { error: 'Please use a valid South African mobile number' };
    }

    // Check rate limits (simplified - in production this uses the database)
    // For now, just check test numbers
    if (!isTestPhone(normalizedPhone) && !IS_DEVELOPMENT) {
      // In production, check rate limits in database
      // This is a placeholder
    }

    // Generate OTP
    const otp = IS_DEVELOPMENT ? '000000' : Math.floor(100000 + Math.random() * 900000).toString();

    // Send via SMS provider
    const smsProvider = getSmsProvider();
    
    try {
      const result = await smsProvider.send({
        to: normalizedPhone,
        body: `Your Patron verification code is: ${otp}`,
        from: 'Patron',
        reference: `otp-${purpose}-${Date.now()}`,
      });

      // Log OTP send
      console.log(`[OTP] Sent to ${normalizedPhone}, messageId: ${result.providerMessageId}`);

      return { success: true, messageId: result.providerMessageId };
    } catch (error) {
      console.error(`[OTP] Failed to send: ${error}`);
      return { error: 'Failed to send OTP' };
    }
  },
});

/**
 * Verify OTP - placeholder implementation
 */
export const verifyOtp = createServerFn({
  method: 'POST',
  input: verifyOtpSchema,
  async handler({ input, ctx }) {
    const { phone, code, purpose } = input;

    // Normalize phone
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return { error: 'Invalid phone number format', valid: false };
    }

    // In development, accept any code for test numbers
    if (IS_DEVELOPMENT && isTestPhone(normalizedPhone)) {
      return { valid: true };
    }

    // In development with console provider, check the stored OTP
    if (IS_DEVELOPMENT) {
      const smsProvider = getSmsProvider();
      if ('getOtpForTesting' in smsProvider) {
        // @ts-ignore - we know ConsoleSmsProvider has this method
        const storedOtp = smsProvider.getOtpForTesting(`otp-${purpose}-test`);
        if (storedOtp === code) {
          return { valid: true };
        }
      }
      // For dev without stored OTP, accept '000000'
      if (code === '000000') {
        return { valid: true };
      }
    }

    // In production, verify against Better Auth
    return { error: 'OTP verification not yet implemented', valid: false };
  },
});

/**
 * Get current session - placeholder
 */
export const getSession = createServerFn({
  method: 'GET',
  async handler({ ctx }) {
    // In production, this will get the session from Better Auth
    return { session: null };
  },
});

/**
 * Sign out - placeholder
 */
export const signOut = createServerFn({
  method: 'POST',
  async handler({ ctx }) {
    // In production, this will sign out from Better Auth
    return { success: true };
  },
});
