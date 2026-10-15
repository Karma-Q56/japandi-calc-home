// Member server functions - PLACEHOLDER
// In production, these would interact with the database
// to manage customer memberships and loyalty cards

import { z } from 'zod';

const cardSchema = z.object({
  slug: z.string().min(1),
});

const joinSchema = z.object({
  restaurantId: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().min(1),
  marketingSms: z.boolean().default(false),
  otp: z.string().min(6).max(6),
});

const setConsentSchema = z.object({
  membershipId: z.string().min(1),
  marketingSms: z.boolean(),
});

/**
 * Get customer's cards
 */
export const myCards = async () => {
  // In production, query database for customer's memberships
  return { memberships: [], total: 0 };
};

/**
 * Get card data for a restaurant
 */
export const card = async (input: z.infer<typeof cardSchema>) => {
  // In production, get membership, stamps, rewards, restaurant info
  return { error: 'Not implemented' };
};

/**
 * Join a restaurant's loyalty program
 */
export const join = async (input: z.infer<typeof joinSchema>) => {
  // In production:
  // 1. Normalize phone
  // 2. Check/create customer
  // 3. Create membership
  // 4. Store consent
  // 5. Generate QR token

  console.log('[Member] Join:', input);
  return { success: true, membershipId: 'placeholder-membership' };
};

/**
 * Set consent preferences
 */
export const setConsent = async (input: z.infer<typeof setConsentSchema>) => {
  // In production, update consent in database
  console.log('[Member] Set consent:', input);
  return { success: true };
};

/**
 * Opt out of marketing
 */
export const optOut = async (input: { token: string }) => {
  // In production, verify token and withdraw marketing consent
  console.log('[Member] Opt out:', input);
  return { success: true };
};

/**
 * Get consent history
 */
export const consentHistory = async (input: { membershipId: string }) => {
  // In production, query consent_event table
  return { events: [] };
};
