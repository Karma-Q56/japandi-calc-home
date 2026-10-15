// Restaurant server functions - PLACEHOLDER
// In production, these would interact with the database
// to manage restaurants and their settings

import { z } from 'zod';

const getPublicSchema = z.object({
  slug: z.string().min(1),
});

const createSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(40),
  city: z.string().min(1).max(40),
  stampsRequired: z.number().min(1).max(20).default(8),
  rewardDescription: z.string().min(1).max(200).default('A free item on us'),
  ownerPhone: z.string().min(1),
});

/**
 * Get public restaurant info
 */
export const getPublic = async (input: z.infer<typeof getPublicSchema>) => {
  // In production, query database for restaurant info
  return { error: 'Not implemented' };
};

/**
 * Create a new restaurant
 */
export const create = async (input: z.infer<typeof createSchema>) => {
  // In production:
  // 1. Validate slug is unique
  // 2. Create restaurant in database
  // 3. Create owner user
  // 4. Generate QR code

  console.log('[Restaurant] Create:', input);
  return { success: true, restaurantId: 'placeholder-restaurant' };
};

/**
 * Update restaurant settings
 */
export const update = async (input: { id: string; name?: string; city?: string; stampsRequired?: number; rewardDescription?: string }) => {
  // In production, update restaurant in database
  console.log('[Restaurant] Update:', input);
  return { success: true };
};

/**
 * List restaurants for owner
 */
export const list = async () => {
  // In production, query database for owner's restaurants
  return { restaurants: [] };
};

/**
 * Get restaurant by ID
 */
export const getById = async (input: { id: string }) => {
  // In production, query database for restaurant
  return { restaurant: null };
};
