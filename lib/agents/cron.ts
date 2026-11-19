/**
 * A five-field cron expression, evaluated in a named timezone.
 *
 * Written rather than imported: the repository has no cron or timezone-library dependency,
 * and adding one to answer "when is the next Wednesday at 09:00 in Dubai" was a larger
 * change than the problem. The scope is stated instead of implied:
 *
 *   fields    minute hour day-of-month month day-of-week
 *   values    star, n, a-b, star/step, a-b/step, comma lists, month and weekday names
 *   semantics day-of-month and day-of-week combine with OR when both are restricted
 *             (the classic vixie-cron rule), which is what people expect from "0 9 1 * 1"
 *   absent    seconds, @macros, L, W, #, and year fields
 *
 * Timezones come from Intl, so tz data is the platform's rather than a bundled copy.
 * Two DST cases are handled explicitly, because both produce wrong schedules if ignored:
 * a local time that does not exist (spring forward) moves to the next real minute, and a
 * local time that happens twice (fall back) resolves to the first occurrence.
 */

export type CronFields = {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
  domRestricted: boolean;
  dowRestricted: boolean;
};

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function expand(
  field: string,
  min: number,
  max: number,
  names?: string[],
  nameOffset = 0
): number[] | null {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) return null;

    let start: number;
    let end: number;

    if (rangePart === "*" || rangePart === "") {
      start = min;
      end = max;
    } else if (rangePart.includes("-")) {
      const [rawStart, rawEnd] = rangePart.split("-");
      const s = resolve(rawStart, names, nameOffset);
      const e = resolve(rawEnd, names, nameOffset);
      if (s === null || e === null) return null;
      start = s;
      end = e;
    } else {
      const single = resolve(rangePart, names, nameOffset);
      if (single === null) return null;
      start = single;
      // "5/15" means from 5 to the field maximum in steps, as vixie-cron reads it.
      end = stepPart === undefined ? single : max;
    }

    if (start < min || end > max || start > end) return null;
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return values.size > 0 ? [...values].sort((a, b) => a - b) : null;
}

function resolve(token: string, names?: string[], nameOffset = 0): number | null {
  const trimmed = token.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (!names) return null;
  const index = names.indexOf(trimmed);
  // A name is a label for a value, and the two field families do not agree on where
  // counting starts: months are 1-12, weekdays are 0-6. `jan` is 1, not 0.
  return index === -1 ? null : index + nameOffset;
}

export function parseCron(expression: string): CronFields | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;

  const minutes = expand(fields[0], 0, 59);
  const hours = expand(fields[1], 0, 23);
  const daysOfMonth = expand(fields[2], 1, 31);
  const months = expand(fields[3], 1, 12, MONTH_NAMES, 1);
  // Cron day-of-week is 0-7 with both 0 and 7 meaning Sunday.
  const rawDays = expand(fields[4], 0, 7, DAY_NAMES);
  if (!minutes || !hours || !daysOfMonth || !months || !rawDays) return null;

  const daysOfWeek = [...new Set(rawDays.map((day) => (day === 7 ? 0 : day)))].sort((a, b) => a - b);

  return {
    minutes,
    hours,
    daysOfMonth,
    months,
    daysOfWeek,
    domRestricted: fields[2] !== "*",
    dowRestricted: fields[4] !== "*",
  };
}

export function isValidCron(expression: string): boolean {
  return parseCron(expression) !== null;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const existing = formatters.get(timezone);
  if (existing) return existing;
  const created = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatters.set(timezone, created);
  return created;
}

/** The local wall-clock reading of an instant, in `timezone`. */
export function wallClock(epochMs: number, timezone: string): WallClock & { second: number } {
  const parts = formatterFor(timezone).formatToParts(new Date(epochMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  // Intl renders midnight as 24 in some locales/engines; normalise it to 0.
  const hour = get("hour") % 24;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
    second: get("second"),
  };
}

function offsetMs(timezone: string, epochMs: number): number {
  const wall = wallClock(epochMs, timezone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  // Second-precision on both sides keeps the subtraction free of sub-second drift.
  return asUtc - (epochMs - (epochMs % 1000));
}

/**
 * The instant at which `timezone` shows this wall time, or null if it never does.
 *
 * Two passes are enough for every real zone: the first uses the offset at the naive guess,
 * the second re-reads the offset at the corrected instant. A spring-forward gap resolves to
 * null and the caller advances instead of inventing a time that did not exist.
 */
function instantForWall(
  wall: { year: number; month: number; day: number; hour: number; minute: number },
  timezone: string
): number | null {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);

  // Around a fall-back an offset can be one of two values, and the naive guess alone picks
  // whichever the offset happens to be at that instant - which is how a first pass landed
  // on the *second* 01:30. So every offset in play is tried, only the ones that reproduce
  // the requested wall time are kept, and the earliest is chosen: the first occurrence.
  const offsets = new Set<number>([
    offsetMs(timezone, naive - 86_400_000),
    offsetMs(timezone, naive),
    offsetMs(timezone, naive + 86_400_000),
  ]);

  const candidates: number[] = [];
  for (const offset of offsets) {
    const candidate = naive - offset;
    const check = wallClock(candidate, timezone);
    if (
      check.year === wall.year &&
      check.month === wall.month &&
      check.day === wall.day &&
      check.hour === wall.hour &&
      check.minute === wall.minute
    ) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) return null; // the local time does not exist (spring gap)
  return Math.min(...candidates);
}

function matchesDay(fields: CronFields, wall: WallClock): boolean {
  if (!fields.months.includes(wall.month)) return false;
  const dom = fields.daysOfMonth.includes(wall.day);
  // Cron's own weekday numbering: 0 = Sunday. `getUTCDay` on the wall date gives that.
  const dow = new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
  const dowMatch = fields.daysOfWeek.includes(dow);

  if (fields.domRestricted && fields.dowRestricted) return dom || dowMatch;
  if (fields.domRestricted) return dom;
  if (fields.dowRestricted) return dowMatch;
  return true;
}

/**
 * The first matching instant strictly after `from`.
 *
 * Searched day by day, then hour by hour, then minute by minute, over the allowed values
 * only, so a yearly expression resolves in a handful of steps rather than 525,600.
 * Returns null when nothing matches within five years, which for a valid five-field
 * expression means it cannot match at all (for example 30 February).
 */
export function nextRunAfter(expression: string, from: Date | number, timezone: string): Date | null {
  const fields = parseCron(expression);
  if (!fields) return null;
  if (!isValidTimezone(timezone)) return null;

  const fromMs = typeof from === "number" ? from : from.getTime();
  const start = wallClock(fromMs, timezone);
  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));

  for (let dayOffset = 0; dayOffset <= 366 * 5; dayOffset += 1) {
    const dayDate = new Date(cursor.getTime() + dayOffset * 86_400_000);
    const wall = {
      year: dayDate.getUTCFullYear(),
      month: dayDate.getUTCMonth() + 1,
      day: dayDate.getUTCDate(),
      hour: 0,
      minute: 0,
    };
    if (!matchesDay(fields, wall)) continue;

    for (const hour of fields.hours) {
      for (const minute of fields.minutes) {
        const instant = instantForWall({ ...wall, hour, minute }, timezone);
        if (instant === null) continue; // local time skipped by a DST gap
        if (instant > fromMs) return new Date(instant);
      }
    }
  }
  return null;
}

/** A cron expression rendered the way the schedule list shows it, or null if invalid. */
export function describeCron(expression: string): string | null {
  const fields = parseCron(expression);
  if (!fields) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  const times = fields.hours.slice(0, 3).map((hour) => `${pad(hour)}:${pad(fields.minutes[0])}`);
  return times.join(", ") + (fields.hours.length > 3 ? ", …" : "");
}
