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
  return !!today && local.time >= today.open && local.time < today.close;
}
