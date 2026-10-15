// Lead server functions
import { z } from 'zod';
import { createServerFn } from '@tanstack/react-start';
import { withContext } from '../db';
import { sql } from 'drizzle-orm';
import { lead as leadTable } from '../db/schema';
import { getConsentWording, CURRENT_CONSENT_VERSIONS } from '@/config/consent';
import { hashIp } from '@/lib/phone';
import { APP_ENV } from '@/config/app';

// Input validation schema
const leadSubmitSchema = z.object({
  restaurantName: z.string().min(1).max(80),
  contactName: z.string().min(1).max(80),
  phone: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  role: z.string().optional().or(z.literal('')),
  venueType: z.string().optional().or(z.literal('')),
  suburb: z.string().optional().or(z.literal('')),
  quietTime: z.string().optional().or(z.literal('')),
  weeklyGuests: z.string().optional().or(z.literal('')),
  planInterest: z.string().optional().or(z.literal('')),
  consent: z.boolean(),
  consentVersion: z.string().optional(),
  calculator: z.record(z.any()).optional(),
  // Honeypot field
  website: z.string().optional(),
});

/**
 * Submit a lead from the marketing form
 */
export const submit = createServerFn({
  method: 'POST',
  input: leadSubmitSchema,
  async handler({ input, ctx }) {
    const {
      restaurantName,
      contactName,
      phone,
      email,
      role,
      venueType,
      suburb,
      quietTime,
      weeklyGuests,
      planInterest,
      consent,
      consentVersion,
      calculator,
      website, // Honeypot
    } = input;

    // Honeypot check - if website is filled, it's likely a bot
    if (website && website.trim() !== '') {
      // Silently drop the submission
      return { success: true };
    }

    // Validate consent
    if (!consent) {
      return { error: 'Please confirm you would like us to contact you', success: false };
    }

    // Get IP for rate limiting
    const ip = ctx.request.headers.get('x-forwarded-for') || ctx.request.headers.get('x-real-ip') || '';
    const ipHash = ip ? await hashIp(ip) : null;

    // Rate limit check (simplified - in production this uses the database)
    // For now, just proceed in development
    
    // Get consent wording
    const version = consentVersion || CURRENT_CONSENT_VERSIONS.loyalty;
    const wording = getConsentWording('loyalty', 'Patron');

    try {
      // In production, use withContext with operator flag
      // For now, we'll use a direct database call since leads don't require tenant context
      
      // Insert lead into database
      // This is a placeholder - in production this will use Drizzle
      console.log(`[Lead] Submitted: ${restaurantName} - ${contactName} - ${phone}`);

      return {
        success: true,
        message: 'Thank you for your interest! We will be in touch soon.',
      };
    } catch (error) {
      console.error(`[Lead] Failed to submit: ${error}`);
      return { error: 'Failed to submit your interest. Please try again.', success: false };
    }
  },
});

/**
 * List leads (operator only)
 */
export const list = createServerFn({
  method: 'GET',
  async handler({ ctx }) {
    // In production, check operator permissions
    // For now, return empty array
    return { leads: [], total: 0 };
  },
});

/**
 * Get lead by ID (operator only)
 */
export const getById = createServerFn({
  method: 'GET',
  input: z.object({ id: z.string().uuid() }),
  async handler({ input }) {
    // In production, check operator permissions
    return { lead: null };
  },
});

/**
 * Update lead status (operator only)
 */
export const updateStatus = createServerFn({
  method: 'POST',
  input: z.object({
    id: z.string().uuid(),
    status: z.enum(['new', 'contacted', 'demo_booked', 'won', 'lost']),
    notes: z.string().optional(),
  }),
  async handler({ input }) {
    // In production, check operator permissions
    return { success: false, error: 'Not yet implemented' };
  },
});
