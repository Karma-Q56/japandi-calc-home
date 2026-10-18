import { DEFAULT_REWARD_DESCRIPTION, DEFAULT_STAMPS_REQUIRED, DEFAULT_VISIT_WINDOW_MINUTES, RESERVED_SLUGS } from '@/config/app';
import { clock } from '@/lib/clock';
import { createSeed } from '@/data/seed';
import { demoRepo, updateDemo } from '@/data/repo';
import type { MenuItem, Restaurant } from '@/data/types';
import { failure, success } from './demo';

export const slugify = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function checkSlug(slug: string, exceptId?: string) {
  const normalized = slugify(slug);
  if (!normalized || normalized.length > 60 || RESERVED_SLUGS.has(normalized)) return { available: false, normalized, reason: 'Choose a different page address.' };
  const taken = demoRepo.read().restaurants.some(item => item.slug === normalized && item.id !== exceptId);
  return { available: !taken, normalized, reason: taken ? 'That page address is already in use.' : '' };
}

export function getRestaurantBySlug(slug: string) {
  const restaurant = demoRepo.read().restaurants.find(item => item.slug === slug && item.status === 'active');
  return restaurant ? success(restaurant) : failure('NOT_FOUND', 'We could not find that restaurant.');
}

export function createRestaurant(input: { name: string; slug: string; suburb: string; status?: Restaurant['status']; plan?: Restaurant['plan']; stampsRequired?: number; rewardDescription?: string; visitWindowMinutes?: number; welcomeStamp?: boolean; theme?: Restaurant['theme']; hours?: Restaurant['hours']; starterMenu?: { name: string; priceCents: number }[]; starterCreditCents?: number }) {
  const name = input.name.trim(); const slugCheck = checkSlug(input.slug);
  if (name.length < 2 || name.length > 80) return failure('INVALID', 'Enter a restaurant name between 2 and 80 characters.');
  if (!slugCheck.available) return failure('INVALID', slugCheck.reason);
  if ((input.stampsRequired ?? DEFAULT_STAMPS_REQUIRED) < 2 || (input.stampsRequired ?? DEFAULT_STAMPS_REQUIRED) > 30) return failure('INVALID', 'Stamps required must be between 2 and 30.');
  const seed = createSeed(clock.now()); const theme = input.theme ?? seed.restaurants[0]!.theme;
  const id = `rest-${crypto.randomUUID()}`; const sectionId = `section-${crypto.randomUUID()}`;
  const restaurant: Restaurant = { id, slug: slugCheck.normalized, name, status: input.status ?? 'draft', plan: input.plan ?? 'starter', suburb: input.suburb.trim(), hours: input.hours ?? seed.restaurants[0]!.hours, stampsRequired: input.stampsRequired ?? DEFAULT_STAMPS_REQUIRED, rewardDescription: input.rewardDescription?.trim() || DEFAULT_REWARD_DESCRIPTION, visitWindowMinutes: input.visitWindowMinutes ?? DEFAULT_VISIT_WINDOW_MINUTES, welcomeStamp: input.welcomeStamp ?? true, theme, pageConfig: ['hero','about','hours','menu','special','join'].map(type => ({ type, enabled: true })), menuSectionIds: [sectionId], specialIds: [], createdAt: new Date(clock.now()).toISOString(), creditCents: input.starterCreditCents ?? 0, senderName: slugCheck.normalized.slice(0, 11), smsCapRestaurant: 3, smsCapMember: 2, contact: '' };
  const section = { id: sectionId, restaurantId: id, name: 'Favourites', sortOrder: 0 };
  const items: MenuItem[] = (input.starterMenu ?? []).map((item, index) => ({ id: `item-${crypto.randomUUID()}`, restaurantId: id, sectionId, name: item.name, description: '', priceCents: Math.round(item.priceCents), available: true, sortOrder: index }));
  const ledger = restaurant.creditCents ? [{ id: `ledger-${crypto.randomUUID()}`, restaurantId: id, type: 'topup' as const, amountCents: restaurant.creditCents, reference: `demo-starter-${id}`, createdAt: restaurant.createdAt }] : [];
  updateDemo(state => ({ ...state, restaurants: [...state.restaurants, restaurant], sections: [...state.sections, section], items: [...state.items, ...items], ledger: [...state.ledger, ...ledger] }));
  return success(restaurant);
}

export function updateRestaurant(id: string, patch: Partial<Restaurant>) {
  const exists = demoRepo.read().restaurants.some(item => item.id === id);
  if (!exists) return failure('NOT_FOUND', 'Restaurant not found.');
  if (patch.slug) { const slugCheck = checkSlug(patch.slug, id); if (!slugCheck.available) return failure('INVALID', slugCheck.reason); patch = { ...patch, slug: slugCheck.normalized }; }
  if (patch.stampsRequired !== undefined && (patch.stampsRequired < 2 || patch.stampsRequired > 30)) return failure('INVALID', 'Stamps required must be between 2 and 30.');
  updateDemo(state => ({ ...state, restaurants: state.restaurants.map(item => item.id === id ? { ...item, ...patch } : item) }));
  return success(demoRepo.read().restaurants.find(item => item.id === id)!);
}

export function saveMenuItem(input: Partial<MenuItem> & Pick<MenuItem, 'restaurantId' | 'sectionId' | 'name' | 'priceCents'>) {
  if (!input.name.trim() || !Number.isInteger(input.priceCents) || input.priceCents < 0) return failure('INVALID', 'Add a name and a valid price.');
  const id = input.id ?? `item-${crypto.randomUUID()}`;
  const item: MenuItem = { id, restaurantId: input.restaurantId, sectionId: input.sectionId, name: input.name.trim(), description: input.description ?? '', priceCents: input.priceCents, available: input.available ?? true, sortOrder: input.sortOrder ?? demoRepo.read().items.filter(existing => existing.sectionId === input.sectionId).length };
  updateDemo(state => ({ ...state, items: input.id ? state.items.map(existing => existing.id === id ? item : existing) : [...state.items, item] }));
  return success(item);
}
export function updateMenuOrder(sectionId: string, itemIds: string[]) {
  updateDemo(state => ({ ...state, items: state.items.map(item => item.sectionId === sectionId ? { ...item, sortOrder: itemIds.indexOf(item.id) < 0 ? item.sortOrder : itemIds.indexOf(item.id) } : item) }));
  return success(true);
}
export function createMenuSection(restaurantId: string, name: string) {
  if (!name.trim()) return failure('INVALID', 'Enter a section name.');
  const restaurant = demoRepo.read().restaurants.find(item => item.id === restaurantId);
  if (!restaurant) return failure('NOT_FOUND', 'Restaurant not found.');
  const section = { id: `section-${crypto.randomUUID()}`, restaurantId, name: name.trim(), sortOrder: restaurant.menuSectionIds.length };
  updateDemo(state => ({ ...state, sections: [...state.sections, section], restaurants: state.restaurants.map(item => item.id === restaurantId ? { ...item, menuSectionIds: [...item.menuSectionIds, section.id] } : item) }));
  return success(section);
}
export function reorderMenuSections(restaurantId: string, sectionIds: string[]) {
  updateDemo(state => ({ ...state, restaurants: state.restaurants.map(item => item.id === restaurantId ? { ...item, menuSectionIds: sectionIds } : item), sections: state.sections.map(section => section.restaurantId === restaurantId ? { ...section, sortOrder: sectionIds.indexOf(section.id) } : section) }));
  return success(true);
}
export function hideMenuItem(id: string, hidden = true) {
  updateDemo(state => ({ ...state, items: state.items.map(item => item.id === id ? { ...item, available: !hidden } : item) }));
  return success(true);
}
export function saveSpecial(input: { id?: string; restaurantId: string; title: string; body: string; startsAt: string; endsAt: string; active: boolean }) {
  if (!input.title.trim() || (input.startsAt && input.endsAt && input.endsAt < input.startsAt)) return failure('INVALID', 'Check the special title and dates.');
  const special = { ...input, id: input.id ?? `special-${crypto.randomUUID()}`, title: input.title.trim() };
  updateDemo(state => ({ ...state, specials: input.id ? state.specials.map(item => item.id === input.id ? special : item) : [...state.specials, special], restaurants: state.restaurants.map(restaurant => restaurant.id === input.restaurantId && !restaurant.specialIds.includes(special.id) ? { ...restaurant, specialIds: [...restaurant.specialIds, special.id] } : restaurant) }));
  return success(special);
}

export function setPageBlockOrder(restaurantId: string, blocks: Restaurant['pageConfig']) {
  return updateRestaurant(restaurantId, { pageConfig: blocks });
}
