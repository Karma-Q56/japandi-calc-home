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
export const myCards = async (input?: { customerId?: string }) => {
  // Slice 2: demo by default; live reads memberships for the customer ctx.
  try {
    const { getRepos } = await import("@/server/repos");
    const { repos } = getRepos({ customerId: input?.customerId });
    if (!input?.customerId) return { memberships: [], total: 0 };
    const cards = await repos.listCards(input.customerId);
    return { memberships: cards, total: cards.length };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not load cards." };
  }
};

/**
 * Get card data for a restaurant
 */
export const card = async (input: z.infer<typeof cardSchema> & { customerId?: string }) => {
  try {
    const { getRepos } = await import("@/server/repos");
    const parsed = cardSchema.parse(input);
    const { repos } = getRepos({ customerId: input.customerId });
    if (!input.customerId) return { error: "Sign in to view your card." };
    const view = await repos.getCard(parsed.slug, input.customerId);
    if (!view) return { error: "You have not joined this restaurant yet." };
    return { card: view };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not load card." };
  }
};

/**
 * Join a restaurant's loyalty program
 */
export const join = async (input: z.infer<typeof joinSchema> & { slug?: string; name?: string; phone?: string; source?: string }) => {
  // Slice 2: shared phone normaliser, consent_event rows with wording text/version.
  // DEMO OTP SEAM: input.otp is accepted as-is in demo; real OTP is out of scope.
  try {
    const { getRepos } = await import("@/server/repos");
    const { repos } = getRepos();
    const result = await repos.joinGuest({
      slug: input.slug ?? "",
      name: input.name ?? "",
      phone: input.phone ?? "",
      marketingSms: input.marketingSms ?? false,
      source: input.source ?? "qr",
      otpVerified: true,
    });
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not join." };
  }
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
