import { demoRepo, updateDemo } from "@/data/repo";
import type { CampaignAudience, Membership, SavedList } from "@/data/types";
import { birthdayOf, johannesburgMonthDay } from "@/lib/birthday";
import { failure, success } from "./demo";

const DAY = 86400000;

export const SEGMENTS = [
  { type: "everyone", label: "Everyone opted in" },
  { type: "new", label: "New guests" },
  { type: "lapsed30", label: "Lapsed 30+ days" },
  { type: "close_to_reward", label: "Close to a reward" },
  { type: "weekday", label: "Visited on a chosen weekday" },
  { type: "birthday_month", label: "Birthdays this month" },
  { type: "saved_list", label: "A saved list" },
] as const;

export function segmentLabel(audience: CampaignAudience): string {
  switch (audience.type) {
    case "everyone":
    case "all_opted_in":
      return "Everyone opted in";
    case "new":
      return `Joined in the last ${audience.days} days`;
    case "lapsed":
    case "lapsed30":
      return `Lapsed ${audience.days}+ days`;
    case "close_to_reward":
      return `${audience.remaining} stamp${audience.remaining === 1 ? "" : "s"} from a reward`;
    case "weekday":
      return `Visited on ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][audience.weekday] ?? "a weekday"}`;
    case "birthday_month":
      return "Birthdays this month";
    case "saved_list": {
      const list = demoRepo.read().savedLists.find((item) => item.id === audience.listId);
      return list ? `Saved list: ${list.name}` : "Saved list";
    }
  }
}

function weekdayInJohannesburg(iso: string): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Johannesburg",
    weekday: "short",
  }).format(new Date(iso));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** Raw segment members BEFORE the SMS opt-in / cap filters (for the count preview). */
export function segmentMemberships(
  state: ReturnType<typeof demoRepo.read>,
  restaurantId: string,
  audience: CampaignAudience,
): Membership[] {
  const now = state.now;
  const memberships = state.memberships.filter(
    (membership) => membership.restaurantId === restaurantId,
  );
  switch (audience.type) {
    case "everyone":
    case "all_opted_in":
      return memberships;
    case "new":
      return memberships.filter(
        (membership) => now - new Date(membership.joinedAt).getTime() <= audience.days * DAY,
      );
    case "lapsed":
    case "lapsed30":
      return memberships.filter((membership) => {
        const last = membership.lastVisitAt
          ? new Date(membership.lastVisitAt).getTime()
          : new Date(membership.joinedAt).getTime();
        return now - last >= audience.days * DAY;
      });
    case "close_to_reward": {
      const restaurant = state.restaurants.find((item) => item.id === restaurantId);
      if (!restaurant) return [];
      return memberships.filter(
        (membership) =>
          restaurant.stampsRequired - membership.stampsCurrent <= audience.remaining &&
          membership.stampsCurrent < restaurant.stampsRequired,
      );
    }
    case "weekday": {
      const visited = new Set(
        state.stamps
          .filter(
            (stamp) =>
              stamp.restaurantId === restaurantId &&
              stamp.status === "valid" &&
              weekdayInJohannesburg(stamp.createdAt) === audience.weekday,
          )
          .map((stamp) => stamp.membershipId),
      );
      return memberships.filter((membership) => visited.has(membership.id));
    }
    case "birthday_month": {
      const month = (audience.month ?? johannesburgMonthDay(now).month) as number;
      return memberships.filter((membership) => {
        const customer = state.customers.find(
          (item) => item.id === membership.customerId,
        );
        const birthday = birthdayOf(customer);
        return birthday !== null && birthday.month === month;
      });
    }
    case "saved_list": {
      const list = state.savedLists.find(
        (item) => item.id === audience.listId && item.restaurantId === restaurantId,
      );
      if (!list) return [];
      return memberships.filter((membership) => list.membershipIds.includes(membership.id));
    }
  }
}

export function recipientCount(
  restaurantId: string,
  audience: CampaignAudience,
): number {
  const state = demoRepo.read();
  return segmentMemberships(state, restaurantId, audience).filter((membership) => {
    if (!membership.marketingSms) return false;
    const customer = state.customers.find((item) => item.id === membership.customerId);
    return !!customer && !customer.deleted;
  }).length;
}

export function listSavedLists(restaurantId: string): SavedList[] {
  return demoRepo
    .read()
    .savedLists.filter((item) => item.restaurantId === restaurantId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveSavedList(input: {
  id?: string;
  restaurantId: string;
  name: string;
  membershipIds: string[];
}) {
  const state = demoRepo.read();
  const name = input.name.trim();
  if (name.length < 1 || name.length > 60) {
    return failure("INVALID", "Give the list a name of 1 to 60 characters.");
  }
  const ids = [...new Set(input.membershipIds)].filter((id) =>
    state.memberships.some((item) => item.id === id && item.restaurantId === input.restaurantId),
  );
  if (ids.length === 0 && !input.id) return failure("INVALID", "Tick at least one guest for this list.");
  const now = new Date(state.now).toISOString();
  if (input.id) {
    const existing = state.savedLists.find((item) => item.id === input.id);
    if (!existing || existing.restaurantId !== input.restaurantId) {
      return failure("NOT_FOUND", "List not found.");
    }
    const updated: SavedList = {
      ...existing,
      name,
      membershipIds: ids,
      updatedAt: now,
    };
    updateDemo((current) => ({
      ...current,
      savedLists: current.savedLists.map((item) => (item.id === updated.id ? updated : item)),
    }));
    return success(updated);
  }
  const list: SavedList = {
    id: `list-${crypto.randomUUID()}`,
    restaurantId: input.restaurantId,
    name,
    membershipIds: ids,
    createdAt: now,
    updatedAt: now,
  };
  updateDemo((current) => ({ ...current, savedLists: [...current.savedLists, list] }));
  return success(list);
}

export function deleteSavedList(input: { id: string; restaurantId: string }) {
  const state = demoRepo.read();
  if (!state.savedLists.some((item) => item.id === input.id && item.restaurantId === input.restaurantId)) {
    return failure("NOT_FOUND", "List not found.");
  }
  updateDemo((current) => ({
    ...current,
    savedLists: current.savedLists.filter((item) => item.id !== input.id),
  }));
  return success(true);
}

/** Remove one guest from a named list without withdrawing their message consent. */
export function removeSavedListMember(input: { listId: string; restaurantId: string; membershipId: string }) {
  const state = demoRepo.read();
  const list = state.savedLists.find((item) => item.id === input.listId && item.restaurantId === input.restaurantId);
  if (!list) return failure("NOT_FOUND", "List not found.");
  if (!state.memberships.some((item) => item.id === input.membershipId && item.restaurantId === input.restaurantId)) {
    return failure("NOT_FOUND", "Guest not found in this restaurant.");
  }
  if (!list.membershipIds.includes(input.membershipId)) return failure("NOT_FOUND", "Guest is not in this list.");
  const updated = { ...list, membershipIds: list.membershipIds.filter((id) => id !== input.membershipId), updatedAt: new Date(state.now).toISOString() };
  updateDemo((current) => ({ ...current, savedLists: current.savedLists.map((item) => item.id === list.id ? updated : item) }));
  return success(updated);
}

/** Build a saved list from a segment in one step. */
export function savedListFromSegment(input: {
  restaurantId: string;
  name: string;
  audience: CampaignAudience;
}) {
  const state = demoRepo.read();
  const memberships = segmentMemberships(state, input.restaurantId, input.audience);
  return saveSavedList({
    restaurantId: input.restaurantId,
    name: input.name,
    membershipIds: memberships.map((membership) => membership.id),
  });
}
