// Readable times for customers (emails, order page): always America/New_York ("ET"). Pure: callers
// pass `now` so "today" is decided against the send/render time.

const ZONE = "America/New_York";
const TIME = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" });
const DAY_KEY = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short" });
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, month: "short", day: "numeric" });

function parse(iso: string | Date | null | undefined): Date | null {
  if (iso === null || iso === undefined) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "7:03pm ET" */
export function etTime(d: Date): string {
  return `${TIME.format(d).replace(/\s?([AP])M$/i, (_m, x: string) => `${x.toLowerCase()}m`)} ET`;
}

/** "Sat Oct 24" */
export function etDate(d: Date): string {
  return `${WEEKDAY.format(d)} ${MONTH_DAY.format(d)}`;
}

export function sameEtDay(a: Date, b: Date): boolean {
  return DAY_KEY.format(a) === DAY_KEY.format(b);
}

/** "7:03pm ET today" or "7:03pm ET, Sat Oct 24"; null for a missing/invalid time. */
export function etDateTime(iso: string | Date | null | undefined, now: Date = new Date()): string | null {
  const d = parse(iso);
  if (!d) return null;
  return sameEtDay(d, now) ? `${etTime(d)} today` : `${etTime(d)}, ${etDate(d)}`;
}

/** "by 7:03pm ET today" / "by 7:03pm ET, Sat Oct 24"; null for a missing/invalid time. */
export function etDeadline(iso: string | Date | null | undefined, now: Date = new Date()): string | null {
  const s = etDateTime(iso, now);
  return s ? `by ${s}` : null;
}

/** "Sat Oct 24" for a date-only mention; null for a missing/invalid time. */
export function etDay(iso: string | Date | null | undefined): string | null {
  const d = parse(iso);
  return d ? etDate(d) : null;
}
