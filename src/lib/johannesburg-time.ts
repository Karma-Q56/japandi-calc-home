export interface JohannesburgTime {
  weekday: string;
  shortWeekday: string;
  hour: number;
  minute: number;
  time: string;
}

/** Calculate venue-local display values from a single supplied instant. */
export function johannesburgTime(epochMs: number): JohannesburgTime {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(epochMs));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(value("hour")) % 24;
  const minute = Number(value("minute"));
  return {
    weekday: value("weekday"),
    shortWeekday: new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Johannesburg",
      weekday: "short",
    }).format(new Date(epochMs)),
    hour,
    minute,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

export function venueIsOpenNow(
  hours: Record<string, { open: string; close: string } | null>,
  epochMs: number,
): boolean {
  const local = johannesburgTime(epochMs);
  const today = hours[local.weekday];
  if (today) {
    // A window that closes after midnight (close earlier than open) runs to the
    // end of today, then continues into tomorrow's early hours.
    const inToday =
      today.close > today.open
        ? local.time >= today.open && local.time < today.close
        : local.time >= today.open;
    if (inToday) return true;
  }
  // Check yesterday's after-midnight window for the early hours of today.
  const yesterday = hours[previousWeekday(local.weekday)];
  return !!yesterday && yesterday.close < yesterday.open && local.time < yesterday.close;
}

// Long names, the keys used by venue hours.
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

function previousWeekday(weekday: string): string {
  const index = WEEKDAYS.indexOf(weekday as (typeof WEEKDAYS)[number]);
  return index <= 0 ? WEEKDAYS[6] : WEEKDAYS[index - 1]!;
}
