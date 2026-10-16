import { demo } from '@/domain/demo';
import { checkSlug, createMenuSection, createRestaurant, getRestaurantBySlug, hideMenuItem, reorderMenuSections, saveMenuItem, saveSpecial, setPageBlockOrder, updateMenuOrder, updateRestaurant } from '@/domain/restaurants';
import { checkJoinRateLimit, createOptOutToken, customerCards, getCard, getCustomerData, joinRestaurant, listRestaurantMembers, optOutByToken, rateLimit, requestAccountDeletion, rotateMemberCode, setMarketingConsent, updateGuestProfile, withdrawMarketingConsent } from '@/domain/members';
import { fakeSmsProvider } from '@/domain/sms';

export const api = {
  demo,
  restaurant: { getBySlug: getRestaurantBySlug, checkSlug, create: createRestaurant, update: updateRestaurant, setPageBlockOrder },
  menu: { createSection: createMenuSection, reorderSections: reorderMenuSections, saveItem: saveMenuItem, hideItem: hideMenuItem, reorder: updateMenuOrder, saveSpecial },
  member: { cards: customerCards, card: getCard, guests: listRestaurantMembers, join: joinRestaurant, checkJoinRateLimit, rateLimit, setConsent: setMarketingConsent, optOut: withdrawMarketingConsent, optOutByToken, createOptOutToken, updateProfile: updateGuestProfile, rotateCode: rotateMemberCode, requestDeletion: requestAccountDeletion, downloadData: getCustomerData },
  stamp: {},
  dash: {},
  campaign: {},
  credit: {},
  ops: {},
  sms: fakeSmsProvider,
};
