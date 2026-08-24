const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Human-readable date, e.g. "20 August 2026". */
export const formatDate = (date: Date): string => dateFormatter.format(date);

/**
 * Machine-readable date for <time datetime="…">.
 *
 * Deliberately not date.toISOString(): that converts to UTC first, so a date
 * parsed as local midnight can come back as the previous day. Reading the
 * local parts avoids the off-by-one entirely.
 */
export const machineDate = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
