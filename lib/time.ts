import { appointmentWindows, schedulingPolicy, site, type WindowKey } from "@/lib/config/site";

const TZ = site.locale.timeZone;

/** Offset in minutes of `timeZone` from UTC at the given instant. */
function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** Converts a wall-clock date ("2026-10-22") and time ("09:00") in `timeZone` to a UTC instant. */
export function zonedToUtc(date: string, time: string, timeZone: string = TZ): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const offset = tzOffsetMinutes(guess, timeZone);
  const result = new Date(guess.getTime() - offset * 60000);
  // Re-check once for zones with DST transitions near the guess.
  const offset2 = tzOffsetMinutes(result, timeZone);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2 * 60000);
}

/** Local calendar date (YYYY-MM-DD) of an instant in the launch time zone. */
export function localDateKey(instant: Date, timeZone: string = TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export interface SlotOption {
  date: string;
  windowKey: WindowKey;
  start: Date;
  end: Date;
}

/** All windows in the booking horizon that start after the minimum lead time. */
export function upcomingSlots(now: Date = new Date()): SlotOption[] {
  const today = localDateKey(now);
  const earliest = now.getTime() + schedulingPolicy.minLeadMinutes * 60000;
  const slots: SlotOption[] = [];
  for (let i = 0; i < schedulingPolicy.bookingHorizonDays; i++) {
    const date = addDays(today, i);
    for (const w of appointmentWindows) {
      const start = zonedToUtc(date, w.start);
      if (start.getTime() < earliest) continue;
      slots.push({ date, windowKey: w.key, start, end: zonedToUtc(date, w.end) });
    }
  }
  return slots;
}

/** Resolves a (date, windowKey) pair to concrete instants, or null if invalid. */
export function resolveSlot(date: string, windowKey: string): SlotOption | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const w = appointmentWindows.find((x) => x.key === windowKey);
  if (!w) return null;
  return { date, windowKey: w.key, start: zonedToUtc(date, w.start), end: zonedToUtc(date, w.end) };
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const dateLongFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const asDate = (d: Date | string) => (typeof d === "string" ? new Date(d) : d);

export const fmt = {
  day: (d: Date | string) => dateFmt.format(asDate(d)),
  date: (d: Date | string) => dateLongFmt.format(asDate(d)),
  time: (d: Date | string) => timeFmt.format(asDate(d)),
  dateTime: (d: Date | string) => dateTimeFmt.format(asDate(d)),
  window: (start: Date | string, end: Date | string) =>
    `${dateFmt.format(asDate(start))}, ${timeFmt.format(asDate(start))} – ${timeFmt.format(asDate(end))}`,
};

export function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 3600000;
}
