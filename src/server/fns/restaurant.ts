// Restaurant server functions
import { z } from 'zod';
import { createServerFn } from '@tanstack/react-start';
import { withContext } from '../db';
import { sql } from 'drizzle-orm';
import { restaurant as restaurantTable, menuSection, menuItem, special } from '../db/schema';
import { RESERVED_SLUGS } from '@/config/app';

// Input validation schemas
const createRestaurantSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  suburb: z.string().optional(),
  city: z.string().optional(),
  visitWindowMinutes: z.number().int().min(0).max(1440).default(240),
  stampsRequired: z.number().int().min(2).max(30).default(8),
  welcomeStamp: z.boolean().default(false),
  rewardDescription: z.string().min(1).default('A free item on us'),
  marketingWeeklyCap: z.number().int().min(0).max(14).default(3),
  memberWeeklyCap: z.number().int().min(0).max(14).default(2),
  smsSenderName: z.string().optional(),
});

const updateRestaurantSchema = createRestaurantSchema.partial();

const createMenuSectionSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
});

const createMenuItemSchema = z.object({
  sectionId: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  priceCents: z.number().int().min(0).optional(),
  available: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const createSpecialSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  active: z.boolean().default(true),
});

/**
 * Validate slug is not reserved
 */
function isSlugReserved(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

/**
 * Get public restaurant info by slug
 */
export const getPublic = createServerFn({
  method: 'GET',
  input: z.object({ slug: z.string() }),
  async handler({ input }) {
    const { slug } = input;

    try {
      // In production, use withContext (no tenant needed for public data)
      // For now, return placeholder
      return {
        restaurant: {
          id: '',
          name: 'Test Cafe',
          slug: slug,
          city: 'Johannesburg',
          rewardDescription: 'A free item on us',
          stampsRequired: 8,
          visitWindowMinutes: 240,
        },
        menu: [],
        specials: [],
      };
    } catch (error) {
      console.error(`[Restaurant] Failed to get public info: ${error}`);
      return { error: 'Restaurant not found', restaurant: null, menu: [], specials: [] };
    }
  },
});

/**
 * Create a new restaurant (operator or owner)
 */
export const create = createServerFn({
  method: 'POST',
  input: createRestaurantSchema,
  async handler({ input, ctx }) {
    const { slug, ...data } = input;

    // Check reserved slugs
    if (isSlugReserved(slug)) {
      return { error: 'This slug is reserved', success: false };
    }

    try {
      // In production, use withContext with operator or owner context
      console.log(`[Restaurant] Create: ${data.name} (${slug})`);

      return {
        success: true,
        restaurant: { id: '', slug, ...data },
      };
    } catch (error) {
      console.error(`[Restaurant] Failed to create: ${error}`);
      return { error: 'Failed to create restaurant', success: false };
    }
  },
});

/**
 * Get restaurant by ID (owner/manager/staff)
 */
export const getById = createServerFn({
  method: 'GET',
  input: z.object({ id: z.string().uuid() }),
  async handler({ input, ctx }) {
    const { id } = input;

    try {
      // In production, use withContext with restaurant context
      return {
        restaurant: {
          id,
          name: 'Test Cafe',
          slug: 'test-cafe',
          status: 'draft',
          plan: 'starter',
        },
      };
    } catch (error) {
      console.error(`[Restaurant] Failed to get by ID: ${error}`);
      return { error: 'Restaurant not found', restaurant: null };
    }
  },
});

/**
 * Update restaurant (owner)
 */
export const update = createServerFn({
  method: 'POST',
  input: z.object({
    id: z.string().uuid(),
    data: updateRestaurantSchema,
  }),
  async handler({ input, ctx }) {
    const { id, data } = input;

    // Check slug if being updated
    if (data.slug && isSlugReserved(data.slug)) {
      return { error: 'This slug is reserved', success: false };
    }

    try {
      // In production, use withContext with restaurant context
      console.log(`[Restaurant] Update: ${id}`);

      return { success: true };
    } catch (error) {
      console.error(`[Restaurant] Failed to update: ${error}`);
      return { error: 'Failed to update restaurant', success: false };
    }
  },
});

/**
 * List menu sections for a restaurant
 */
export const listMenuSections = createServerFn({
  method: 'GET',
  input: z.object({ restaurantId: z.string().uuid() }),
  async handler({ input, ctx }) {
    const { restaurantId } = input;

    try {
      // In production, use withContext
      return { sections: [] };
    } catch (error) {
      console.error(`[Restaurant] Failed to list menu sections: ${error}`);
      return { error: 'Failed to load menu sections', sections: [] };
    }
  },
});

/**
 * Create menu section
 */
export const createMenuSection = createServerFn({
  method: 'POST',
  input: z.object({
    restaurantId: z.string().uuid(),
    data: createMenuSectionSchema,
  }),
  async handler({ input, ctx }) {
    const { restaurantId, data } = input;

    try {
      // In production, use withContext with restaurant context
      console.log(`[Restaurant] Create menu section: ${data.name}`);

      return {
        success: true,
        section: { id: '', restaurantId, ...data },
      };
    } catch (error) {
      console.error(`[Restaurant] Failed to create menu section: ${error}`);
      return { error: 'Failed to create menu section', success: false };
    }
  },
});

/**
 * Create menu item
 */
export const createMenuItem = createServerFn({
  method: 'POST',
  input: z.object({
    restaurantId: z.string().uuid(),
    data: createMenuItemSchema,
  }),
  async handler({ input, ctx }) {
    const { restaurantId, data } = input;

    try {
      // In production, use withContext with restaurant context
      console.log(`[Restaurant] Create menu item: ${data.name}`);

      return {
        success: true,
        item: { id: '', restaurantId, ...data },
      };
    } catch (error) {
      console.error(`[Restaurant] Failed to create menu item: ${error}`);
      return { error: 'Failed to create menu item', success: false };
    }
  },
});

/**
 * Create special
 */
export const createSpecial = createServerFn({
  method: 'POST',
  input: z.object({
    restaurantId: z.string().uuid(),
    data: createSpecialSchema,
  }),
  async handler({ input, ctx }) {
    const { restaurantId, data } = input;

    try {
      // In production, use withContext with restaurant context
      console.log(`[Restaurant] Create special: ${data.title}`);

      return {
        success: true,
        special: { id: '', restaurantId, ...data },
      };
    } catch (error) {
      console.error(`[Restaurant] Failed to create special: ${error}`);
      return { error: 'Failed to create special', success: false };
    }
  },
});

/**
 * Generate QR code URL for a restaurant
 */
export const getQrCodeUrl = createServerFn({
  method: 'GET',
  input: z.object({ slug: z.string() }),
  async handler({ input, ctx }) {
    const { slug } = input;
    const appUrl = import.meta.env.APP_URL || 'http://localhost:5173';
    return { url: `${appUrl}/r/${slug}/join?src=qr` };
  },
});
