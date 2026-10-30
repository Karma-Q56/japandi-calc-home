// Stamp server functions - PLACEHOLDER
// In production, these would interact with the database
// to record stamps and manage rewards

import { z } from 'zod';

const lookupSchema = z.object({
  codeOrToken: z.string().min(1),
});

const recordSchema = z.object({
  membershipId: z.string().min(1),
  staffId: z.string().min(1),
  restaurantId: z.string().min(1),
  campaignCode: z.string().optional(),
});

const redeemSchema = z.object({
  membershipId: z.string().min(1),
  staffId: z.string().min(1),
});

/**
 * Lookup member by code or token
 */
export const lookup = async (input: z.infer<typeof lookupSchema>) => {
  // In production, query database for member info
  return { error: 'Not implemented' };
};

/**
 * Record a stamp
 */
export const record = async (input: z.infer<typeof recordSchema> & { key?: string; pin?: string }) => {
  // Slice 3: demo engine by default; live calls the record_stamp SQL function
  // (stamped/too_soon/duplicate_retry/reward/undo) + audit_event + PIN HMAC.
  try {
    const { getRepos } = await import("@/server/repos");
    const parsed = recordSchema.parse(input);
    const { repos } = getRepos({ restaurantId: parsed.restaurantId });
    const outcome = await repos.recordStamp({
      restaurantId: parsed.restaurantId,
      membershipId: parsed.membershipId,
      staffId: parsed.staffId,
      key: input.key ?? `${Date.now()}-${parsed.membershipId}`,
      pin: input.pin ?? "",
    });
    return { success: true, ...outcome };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not stamp." };
  }
};

/**
 * Redeem a reward
 */
export const redeem = async (input: z.infer<typeof redeemSchema>) => {
  // In production:
  // 1. Check if member has rewards available
  // 2. Mark reward as redeemed
  // 3. Return result

  console.log('[Stamp] Redeem:', input);
  return { success: true, rewardsRemaining: 0 };
};

/**
 * Undo last stamp
 */
export const undo = async (input: { membershipId: string; staffId: string }) => {
  // In production, remove last stamp
  console.log('[Stamp] Undo:', input);
  return { success: true };
};

/**
 * Get stamp history for member
 */
export const history = async (input: { membershipId: string }) => {
  // In production, query stamp history
  return { stamps: [] };
};
