import { demoRepo } from "@/data/repo";
import { visitPattern } from "@/lib/visits";
import type { CampaignAudience, Restaurant } from "@/data/types";

const DAY = 86400000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** What a fill-in can currently be filled with: real data, or null for none. */
export interface FillFacts {
  favouriteItem: string | null;
  usualDay: string | null;
  reward: string | null;
  slippingRegulars: number;
}

/**
 * Fill-ins resolve against this restaurant's own records only. Where there is
 * no data yet, the caller gets null and renders a safe wording instead.
 */
export function messageFillFacts(restaurantId: string): FillFacts {
  const state = demoRepo.read();
  const restaurant = state.restaurants.find((item) => item.id === restaurantId);
  const reward = restaurant?.rewardDescription ?? null;

  // Most ordered item, from till orders with item lines.
  const qty = new Map<string, number>();
  for (const order of state.orders) {
    if (order.restaurantId !== restaurantId) continue;
    for (const line of order.items) {
      if (line.kind !== "item") continue;
      qty.set(line.label.toLowerCase(), (qty.get(line.label.toLowerCase()) ?? 0) + line.qty);
    }
  }
  const top = [...qty.entries()].sort((a, b) => b[1] - a[1])[0];
  const favouriteItem = top ? top[0] : null;

  // Usual day: one vote per membership whose own pattern has a usual day.
  const dayVotes = new Array<number>(7).fill(0);
  let slippingRegulars = 0;
  const now = new Date(state.now).toISOString();
  const memberships = state.memberships.filter((m) => m.restaurantId === restaurantId);
  const stampsByMembership = new Map<string, typeof state.stamps>();
  for (const stamp of state.stamps) {
    if (stamp.restaurantId !== restaurantId || stamp.status !== "valid") continue;
    const list = stampsByMembership.get(stamp.membershipId) ?? [];
    list.push(stamp);
    stampsByMembership.set(stamp.membershipId, list);
  }
  for (const membership of memberships) {
    const stamps = stampsByMembership.get(membership.id) ?? [];
    const recent = stamps.filter((stamp) => state.now - Date.parse(stamp.createdAt) <= 90 * DAY);
    const pattern = visitPattern(recent, now);
    for (const day of pattern.usualDays) dayVotes[day] = (dayVotes[day] ?? 0) + 1;
    if (pattern.slipping) slippingRegulars += 1;
  }
  const bestDay = dayVotes.reduce<number | null>(
    (best, count, index) => {
      if (count === 0) return best;
      if (best === null) return index;
      return count > (dayVotes[best] ?? 0) ? index : best;
    },
    null,
  );
  const usualDay = bestDay === null ? null : WEEKDAYS[bestDay] ?? null;

  return { favouriteItem, usualDay, reward, slippingRegulars };
}

/**
 * Replace every supported fill-in. Anything with no data gets a safe wording,
 * and {name} is accepted as a shorter form of {first_name}.
 */
export function applyFillIns(body: string, facts: FillFacts, firstName: string): string {
  return body
    .replaceAll("{first_name}", firstName)
    .replaceAll("{name}", firstName)
    .replaceAll("{favourite_item}", facts.favouriteItem ?? "your favourite")
    .replaceAll("{usual_day}", facts.usualDay ?? "your next visit")
    .replaceAll("{reward}", facts.reward ?? "a treat on us");
}

export interface MessageSuggestion {
  id: string;
  title: string;
  note: string;
  body: string;
}

/** Rule based wording, always editable, one per common goal. */
export function suggestMessages(input: {
  restaurant: Pick<Restaurant, "name" | "rewardDescription">;
  audience: CampaignAudience;
  facts: FillFacts;
}): MessageSuggestion[] {
  const { restaurant, audience, facts } = input;
  const venue = restaurant.name;
  const item = facts.favouriteItem;
  const itemPhrase = item ? item.toLowerCase() : "something from the menu";
  const reward = (facts.reward ?? restaurant.rewardDescription ?? "a treat on us").toLowerCase();

  // Per-guest fill-ins stay as tokens; the preview resolves them.
  const winBack = `Hi {first_name}, it has been a while since your last visit to ${venue}. ${item ? `Pop in this week for your usual ${itemPhrase}.` : "Pop in this week, we would love to see you."}`;

  const birthday = `Hi {first_name}, happy birthday for this month! Come celebrate at ${venue} and enjoy ${item ? `a complimentary ${itemPhrase}` : "a treat on us"}.`;

  const quietDay = `Hi {first_name}, ${fallbackDay(facts.usualDay, audience)} is quieter than usual. Your table is yours if you fancy ${itemPhrase}.`;

  const rewardNudge = `Hi {first_name}, you are close to a reward: ${reward}. See you soon at ${venue}.`;

  const everyoneFavourite = `Hi {first_name}, good news from ${venue}: your usual ${itemPhrase} tastes as good as ever. See you soon.`;

  const list: MessageSuggestion[] = [];

  const push = (id: string, title: string, note: string, body: string) =>
    list.push({ id, title, note, body });

  switch (audience.type) {
    case "lapsed":
    case "lapsed30":
      push("win_back", "Win back a lapsed guest", "Friendly, no pressure. Uses their usual order when we have it.", winBack);
      break;
    case "birthday_month":
      push("birthday", "Birthday message", "Warm and short. Pairs well with a small gift.", birthday);
      break;
    case "weekday":
      push("quiet_day", "Fill a quiet day", `Speaks to guests who know ${venue} on ${fallbackDay(facts.usualDay, audience)}.`, quietDay);
      break;
    case "close_to_reward":
      push("reward_nudge", "Reward nudge", "Tells them how close they are.", rewardNudge);
      break;
    case "everyone":
    case "all_opted_in":
      push("favourite", "Their usual is waiting", "Simple and warm. Falls back safely when no orders are recorded.", everyoneFavourite);
      break;
    case "saved_list":
      push("favourite", "Hello to the list", "Simple and warm, ready to edit.", everyoneFavourite);
      break;
    case "new":
      push("welcome", "Welcome note", "Sets up the card habit early.", `Hi {first_name}, welcome to ${venue}! Your card is ready and every visit brings you closer to ${reward}.`);
      break;
  }

  if (facts.slippingRegulars > 0 && audience.type !== "lapsed" && audience.type !== "lapsed30") {
    push(
      "slipping",
      "Win back a regular",
      `${facts.slippingRegulars} regular${facts.slippingRegulars === 1 ? "" : "s"} have gone quiet.`,
      winBack,
    );
  }

  return list;
}

function fallbackDay(usualDay: string | null, audience: CampaignAudience): string {
  if (audience.type === "weekday") return WEEKDAYS[audience.weekday] ?? "this week";
  return usualDay ?? "this week";
}
