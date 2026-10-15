// Lead server functions - PLACEHOLDER
// In production, these would interact with the database
// to create and manage leads from the marketing form

import { z } from 'zod';

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
  website: z.string().optional(),
});

/**
 * Submit a lead from the marketing form
 */
export const submit = async (input: z.infer<typeof leadSubmitSchema>) => {
  // In production, this would:
  // 1. Validate the input
  // 2. Check honeypot field
  // 3. Check rate limiting
  // 4. Store the lead in the database
  // 5. Return success or error

  if (input.website) {
    return { error: 'Honeypot detected' };
  }

  console.log('[Lead] Submitted:', input);
  return { success: true, id: 'placeholder' };
};

/**
 * Get leads for the ops console
 */
export const list = async () => {
  // In production, query database for leads
  return { leads: [], total: 0 };
};

/**
 * Get lead statistics
 */
export const stats = async () => {
  // In production, return lead statistics
  return { total: 0, thisWeek: 0, thisMonth: 0 };
};

/**
 * Update lead status
 */
export const updateStatus = async (input: { id: string; status: string }) => {
  // In production, update lead status in database
  return { success: true };
};
