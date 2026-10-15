// Stamp server functions
import { z } from 'zod';
import { createServerFn } from '@tanstack/react-start';
import { withContext } from '../db';
import { sql } from 'drizzle-orm';
import { stampEvent, reward, membership, customer } from '../db/schema';
import { APP_ENV } from '@/config/app';

// Input validation schemas
const lookupSchema = z.object({
  codeOrToken: z.string().min(1),
});

const addStampSchema = z.object({
  membershipId: z.string().uuid(),
  idempotencyKey: z.string().min(1),
});

const undoStampSchema = z.object({
  stampId: z.string().uuid(),
  reason: z.string().optional(),
});

const redeemRewardSchema = z.object({
  rewardId: z.string().uuid(),
});

const redeemOfferSchema = z.object({
  code: z.string().min(1).max(12),
  membershipId: z.string().uuid(),
});

/**
 * Lookup member by code or token
 */
export const lookup = createServerFn({
  method: 'POST',
  input: lookupSchema,
  async handler({ input, ctx }) {
    const { codeOrToken } = input;

    try {
      // In production, use withContext with staff context
      // Lookup customer by qr_token or short code
      console.log(`[Stamp] Lookup: ${codeOrToken}`);

      // In production, query database
      // Return member info: name, current stamps, rewards waiting
      return {
        member: {
          id: '',
          name: 'Test Member',
          membershipId: '',
          stampsCurrent: 0,
          stampsTotal: 0,
          rewardsWaiting: 0,
        },
        error: null,
      };
    } catch (error) {
      console.error(`[Stamp] Failed lookup: ${error}`);
      return { error: 'Member not found', member: null };
    }
  },
});

/**
 * Add a stamp
 */
export const add = createServerFn({
  method: 'POST',
  input: addStampSchema,
  async handler({ input, ctx }) {
    const { membershipId, idempotencyKey } = input;

    // Get staff from session
    const staffId = ''; // Placeholder
    const restaurantId = ''; // Placeholder

    try {
      // In production, use withContext with restaurant/staff context
      // Call record_stamp function via SQL
      console.log(`[Stamp] Add: membership ${membershipId}, key ${idempotencyKey}`);

      // In production, execute:
      // const result = await tx.execute(sql`
      //   select * from record_stamp(${restaurantId}, ${membershipId}, ${staffId}, ${idempotencyKey})
      // `);

      // For now, simulate results
      const result = {
        out_result: 'stamped' as const,
        out_stamp_id: crypto.randomUUID(),
        out_stamps: 1,
        out_reward_id: null as string | null,
      };

      return {
        result: result.out_result,
        stampId: result.out_stamp_id,
        stamps: result.out_stamps,
        rewardId: result.out_reward_id,
        error: null,
      };
    } catch (error) {
      console.error(`[Stamp] Failed to add: ${error}`);
      return { error: 'Failed to add stamp', result: null, stampId: null, stamps: 0, rewardId: null };
    }
  },
});

/**
 * Undo a stamp
 */
export const undo = createServerFn({
  method: 'POST',
  input: undoStampSchema,
  async handler({ input, ctx }) {
    const { stampId, reason } = input;

    // Get staff from session
    const staffId = ''; // Placeholder

    try {
      // In production, use withContext with restaurant/staff context
      // Check if stamp is within 10 minutes and not already undone
      // Update stamp_event status to 'undone'
      // Reverse counters and void any reward created
      // Write to audit_event
      console.log(`[Stamp] Undo: ${stampId}, reason: ${reason}`);

      return { success: true };
    } catch (error) {
      console.error(`[Stamp] Failed to undo: ${error}`);
      return { error: 'Failed to undo stamp', success: false };
    }
  },
});

/**
 * Redeem a reward
 */
export const redeemReward = createServerFn({
  method: 'POST',
  input: redeemRewardSchema,
  async handler({ input, ctx }) {
    const { rewardId } = input;

    // Get staff from session
    const staffId = ''; // Placeholder

    try {
      // In production, use withContext with restaurant/staff context
      // Check reward is available and not expired
      // Update reward status to 'redeemed'
      // Record redemption
      console.log(`[Stamp] Redeem reward: ${rewardId}`);

      return { success: true };
    } catch (error) {
      console.error(`[Stamp] Failed to redeem reward: ${error}`);
      return { error: 'Failed to redeem reward', success: false };
    }
  },
});

/**
 * Redeem an offer (campaign code)
 */
export const redeemOffer = createServerFn({
  method: 'POST',
  input: redeemOfferSchema,
  async handler({ input, ctx }) {
    const { code, membershipId } = input;

    // Get staff from session
    const staffId = ''; // Placeholder

    try {
      // In production, use withContext with restaurant/staff context
      // Validate campaign is active and within dates
      // Check guest was a recipient
      // Check not already redeemed
      // Insert redemption
      // Optionally award a stamp
      console.log(`[Stamp] Redeem offer: ${code} for membership ${membershipId}`);

      return { success: true, awardStamp: false };
    } catch (error) {
      console.error(`[Stamp] Failed to redeem offer: ${error}`);
      return { error: 'Failed to redeem offer', success: false, awardStamp: false };
    }
  },
});
