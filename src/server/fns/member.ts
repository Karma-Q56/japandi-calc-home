// Member (customer) server functions
import { z } from 'zod';
import { createServerFn } from '@tanstack/react-start';
import { withContext } from '../db';
import { sql } from 'drizzle-orm';
import { customer, membership, consentEvent } from '../db/schema';
import { normalizePhone, isValidSAMobile } from '@/lib/phone';
import { getConsentWording, CURRENT_CONSENT_VERSIONS, type ConsentPurpose, type ConsentAction } from '@/config/consent';
import { generateOtp, hashPhone, hashIp } from '@/lib/phone';
import { APP_ENV, IS_DEVELOPMENT } from '@/config/app';

// Input validation schemas
const joinSchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().min(1).max(80),
  phone: z.string().min(1),
  consents: z.record(z.boolean()),
  src: z.string().min(1).max(32).regex(/^[a-z0-9:_-]+$/),
});

const setConsentSchema = z.object({
  membershipId: z.string().uuid(),
  purpose: z.enum(['loyalty', 'marketing_sms', 'marketing_push']),
  granted: z.boolean(),
});

/**
 * Join a restaurant as a member
 */
export const join = createServerFn({
  method: 'POST',
  input: joinSchema,
  async handler({ input, ctx }) {
    const { restaurantId, name, phone, consents, src } = input;

    // Normalize phone
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return { error: 'Invalid phone number format', success: false };
    }

    // Validate South African mobile
    if (!isValidSAMobile(normalizedPhone)) {
      return { error: 'Please use a valid South African mobile number', success: false };
    }

    // Get IP for rate limiting and consent logging
    const ip = ctx.request.headers.get('x-forwarded-for') || ctx.request.headers.get('x-real-ip') || '';
    const ipHash = ip ? await hashIp(ip) : null;

    // Get phone hash for rate limiting
    const phoneHash = await hashPhone(normalizedPhone);

    try {
      // In production, use withContext with customer context
      // For now, log the join attempt
      console.log(`[Member] Join: ${name} (${normalizedPhone}) -> restaurant ${restaurantId} from ${src}`);

      // Check if customer exists
      // In production, this would query the database
      const existingCustomer = null; // Placeholder

      let customerId: string;

      if (existingCustomer) {
        // Use existing customer
        customerId = existingCustomer.id;
      } else {
        // Create new customer
        // In production: insert into customer table
        customerId = crypto.randomUUID();
        console.log(`[Member] Created customer: ${customerId}`);
      }

      // Check if already a member of this restaurant
      const existingMembership = null; // Placeholder
      
      if (existingMembership) {
        return {
          success: true,
          existing: true,
          membershipId: existingMembership.id,
        };
      }

      // Create membership
      const membershipId = crypto.randomUUID();
      console.log(`[Member] Created membership: ${membershipId}`);

      // Store consent events
      const restaurantName = 'Restaurant'; // In production, fetch from database
      
      for (const [purpose, granted] of Object.entries(consents)) {
        if (granted) {
          const wording = getConsentWording(purpose as ConsentPurpose, restaurantName);
          console.log(`[Member] Consent ${purpose}: granted, version ${wording.version}`);
        }
      }

      // Generate QR token
      const qrToken = crypto.randomUUID().replace(/-/g, '');

      return {
        success: true,
        membershipId,
        customerId,
        qrToken,
        welcomeStamp: false, // In production, check restaurant.welcomeStamp
      };
    } catch (error) {
      console.error(`[Member] Failed to join: ${error}`);
      return { error: 'Failed to join restaurant', success: false };
    }
  },
});

/**
 * Get my cards (memberships) for the current customer
 */
export const myCards = createServerFn({
  method: 'GET',
  async handler({ ctx }) {
    // In production, get customer from session
    const customerId = ''; // Placeholder

    try {
      // In production, use withContext with customer context
      return {
        memberships: [],
        total: 0,
      };
    } catch (error) {
      console.error(`[Member] Failed to get my cards: ${error}`);
      return { error: 'Failed to load your cards', memberships: [], total: 0 };
    }
  },
});

/**
 * Get card details for a specific restaurant
 */
export const card = createServerFn({
  method: 'GET',
  input: z.object({ slug: z.string() }),
  async handler({ input, ctx }) {
    const { slug } = input;

    // In production, get customer from session
    const customerId = ''; // Placeholder

    try {
      // In production, use withContext with customer context
      return {
        membership: null,
        stamps: [],
        rewards: [],
        restaurant: null,
      };
    } catch (error) {
      console.error(`[Member] Failed to get card: ${error}`);
      return { error: 'Failed to load card', membership: null, stamps: [], rewards: [], restaurant: null };
    }
  },
});

/**
 * Set consent for a membership
 */
export const setConsent = createServerFn({
  method: 'POST',
  input: setConsentSchema,
  async handler({ input, ctx }) {
    const { membershipId, purpose, granted } = input;

    // Get IP for logging
    const ip = ctx.request.headers.get('x-forwarded-for') || ctx.request.headers.get('x-real-ip') || '';
    const ipHash = ip ? await hashIp(ip) : null;

    try {
      // In production, use withContext with customer context
      console.log(`[Member] Set consent: membership ${membershipId}, purpose ${purpose}, granted ${granted}`);

      // Get restaurant name for wording
      const restaurantName = 'Restaurant'; // In production, fetch from database
      const wording = getConsentWording(purpose, restaurantName);

      // In production: insert consent_event
      // update membership marketing flags

      return { success: true };
    } catch (error) {
      console.error(`[Member] Failed to set consent: ${error}`);
      return { error: 'Failed to update consent', success: false };
    }
  },
});

/**
 * Rotate QR token
 */
export const rotateToken = createServerFn({
  method: 'POST',
  input: z.object({ membershipId: z.string().uuid() }),
  async handler({ input, ctx }) {
    const { membershipId } = input;

    try {
      // In production, use withContext with customer context
      const newToken = crypto.randomUUID().replace(/-/g, '');
      console.log(`[Member] Rotated token for membership ${membershipId}: ${newToken}`);

      return {
        success: true,
        qrToken: newToken,
      };
    } catch (error) {
      console.error(`[Member] Failed to rotate token: ${error}`);
      return { error: 'Failed to rotate token', success: false };
    }
  },
});

/**
 * Export data (POPIA)
 */
export const exportData = createServerFn({
  method: 'GET',
  async handler({ ctx }) {
    // In production, get customer from session
    const customerId = ''; // Placeholder

    try {
      // In production, use withContext with customer context
      // Fetch all customer data and return as JSON
      return {
        data: null,
        success: false,
        error: 'Not yet implemented',
      };
    } catch (error) {
      console.error(`[Member] Failed to export data: ${error}`);
      return { error: 'Failed to export data', success: false, data: null };
    }
  },
});

/**
 * Request deletion (POPIA)
 */
export const requestDeletion = createServerFn({
  method: 'POST',
  async handler({ ctx }) {
    // In production, get customer from session
    const customerId = ''; // Placeholder

    try {
      // In production, use withContext with customer context
      // Create data_request and anonymize customer
      return { success: false, error: 'Not yet implemented' };
    } catch (error) {
      console.error(`[Member] Failed to request deletion: ${error}`);
      return { error: 'Failed to request deletion', success: false };
    }
  },
});
