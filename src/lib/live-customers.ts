import type { CustomerFilter, CustomerSort } from "@/domain/customers";

export type LiveCustomerRow = {
  membershipId: string;
  customerId: string;
  name: string;
  phoneE164: string;
  stampsCurrent: number;
  stampsTotal: number;
  stampsRequired: number;
  rewardsWaiting: number;
  lastVisitAt: string | null;
  joinedAt: string;
  smsOptedIn: boolean;
  birthdayMonth: number | null;
};

const DAY = 86400000;

const daysSince = (iso: string | null, now: number) =>
  iso === null ? null : Math.floor((now - new Date(iso).getTime()) / DAY);

/** The guest list filters, shared by the live screen and its tests. */
export function filterLiveCustomers(
  rows: LiveCustomerRow[],
  options: { search: string; filter: CustomerFilter; sort: CustomerSort },
  now = Date.now(),
) {
  const needle = options.search.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const month = new Date(now + 2 * 3600000).getUTCMonth();

  const filtered = rows.filter((row) => {
    const matchesName = row.name.toLowerCase().includes(needle);
    const matchesPhone =
      digits.length > 0 && row.phoneE164.replace(/\D/g, "").includes(digits);
    if (needle && !matchesName && !matchesPhone) return false;
    const since = daysSince(row.lastVisitAt, now);
    switch (options.filter) {
      case "one_stamp_away":
        return row.stampsRequired - row.stampsCurrent === 1;
      case "new14":
        return daysSince(row.joinedAt, now)! <= 14;
      case "recent30":
        return since !== null && since <= 30;
      case "reward_ready":
        return row.rewardsWaiting > 0;
      case "gone_quiet":
        return since === null || since >= 45;
      case "regulars":
        return row.stampsTotal >= row.stampsRequired;
      case "lapsed30":
        return since === null || since >= 30;
      case "lapsed45":
        return since === null || since >= 45;
      case "lapsed60":
        return since === null || since >= 60;
      case "sms":
        return row.smsOptedIn;
      case "no_sms":
        return !row.smsOptedIn;
      case "birthdays":
        return row.birthdayMonth === month;
      default:
        return true;
    }
  });

  return [...filtered].sort((a, b) => {
    switch (options.sort) {
      case "stamps":
        return b.stampsCurrent - a.stampsCurrent;
      case "fewest_stamps":
        return a.stampsCurrent - b.stampsCurrent;
      case "visits":
        return b.stampsTotal - a.stampsTotal;
      case "name":
        return a.name.localeCompare(b.name);
      default: {
        const aTime = a.lastVisitAt ? new Date(a.lastVisitAt).getTime() : 0;
        const bTime = b.lastVisitAt ? new Date(b.lastVisitAt).getTime() : 0;
        return bTime - aTime;
      }
    }
  });
}

export function maskLivePhone(phone: string) {
  return `•••• ${phone.slice(-4)}`;
}
