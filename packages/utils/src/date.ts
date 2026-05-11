/** Returns a new Date with the specified number of minutes added. */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/** Returns a new Date with the specified number of hours added. */
export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/** Returns a new Date with the specified number of days added. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Returns true if date is before windowEnd. */
export function isWithinWindow(date: Date, windowEnd: Date): boolean {
  return date.getTime() < windowEnd.getTime();
}

/**
 * Formats a Date as a human-readable string in Nigeria Standard Time (UTC+1).
 * Format: "07 May 2026, 14:30"
 */
export function formatNigeriaTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(',', '')
    .replace(' at ', ', ');
}

/**
 * Returns a Date that is the specified number of business days (Mon–Fri) from now.
 */
export function getBusinessDaysFromNow(days: number): Date {
  let current = new Date();
  let remaining = days;

  while (remaining > 0) {
    current = addDays(current, 1);
    const dow = current.getDay(); // 0 = Sunday, 6 = Saturday
    if (dow !== 0 && dow !== 6) {
      remaining--;
    }
  }

  return current;
}
