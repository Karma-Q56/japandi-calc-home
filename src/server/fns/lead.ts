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
  calculator: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().optional(),
  website: z.string().optional(),
});

/**
 * Submit a lead from the marketing form
 */
export const submit = async (input: z.infer<typeof leadSubmitSchema>) => {
  // Slice 1: honeypot + rate limit run in both modes. Demo writes the local
  // repo; live inserts into `lead` + `rate_limit_hit` inside withContext.
  try {
    const { getRepos } = await import("@/server/repos");
    const { repos } = getRepos();
    const parsed = leadSubmitSchema.parse(input);
    const { id } = await repos.submitLead({
      restaurantName: parsed.restaurantName,
      contactName: parsed.contactName,
      phone: parsed.phone,
      email: parsed.email || undefined,
      role: parsed.role || undefined,
      venueType: parsed.venueType || undefined,
      suburb: parsed.suburb || undefined,
      quietTime: parsed.quietTime || undefined,
      weeklyGuests: parsed.weeklyGuests || undefined,
      planInterest: parsed.planInterest || undefined,
      consent: parsed.consent,
      consentVersion: parsed.consentVersion ?? "v1",
      calculator: parsed.calculator as Record<string, unknown> | undefined,
      notes: parsed.notes || undefined,
      website: parsed.website || undefined,
    });
    return { success: true, id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not submit." };
  }
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
