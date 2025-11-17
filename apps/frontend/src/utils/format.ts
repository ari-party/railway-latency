export function formatNumber(options?: Intl.NumberFormatOptions) {
  const formatter = new Intl.NumberFormat(undefined, options);
  return (value: number) => formatter.format(value);
}

export function formatDate(options?: Intl.DateTimeFormatOptions) {
  const formatter = new Intl.DateTimeFormat(undefined, options);
  return (value: Date) => formatter.format(value);
}

const tooltipHeaderFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const tooltipTimeZoneShortFormatter = new Intl.DateTimeFormat(undefined, {
  timeZoneName: 'short',
});

const tooltipTimeZoneLongFormatter = new Intl.DateTimeFormat(undefined, {
  timeZoneName: 'long',
});

function extractTimeZoneAbbreviation(date: Date): string | undefined {
  const shortParts = tooltipTimeZoneShortFormatter
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;

  if (shortParts && /^[A-Za-z]{2,5}$/.test(shortParts))
    return shortParts.toUpperCase();

  const longName = tooltipTimeZoneLongFormatter
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;
  if (!longName) return shortParts;

  const tokens = longName.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return shortParts;

  const filtered = tokens.filter(
    (token) =>
      !['standard', 'daylight', 'summer'].includes(token.toLowerCase()),
  );
  const abbreviation = filtered.map((token) => token[0]).join('');

  return abbreviation.length > 0
    ? abbreviation.toUpperCase()
    : shortParts?.toUpperCase();
}

export function formatTooltipHeader(date: Date): string {
  const parts = tooltipHeaderFormatter.formatToParts(date);

  let day: string | undefined;
  let month: string | undefined;
  let hour: string | undefined;
  let minute: string | undefined;
  for (const part of parts)
    switch (part.type) {
      case 'day':
        day = part.value;
        break;
      case 'month':
        month = part.value;
        break;
      case 'hour':
        hour = part.value;
        break;
      case 'minute':
        minute = part.value;
        break;
      default:
        break;
    }

  const zone = extractTimeZoneAbbreviation(date);

  if (!day || !month || !hour || !minute || !zone)
    return tooltipHeaderFormatter.format(date);

  return `${day} ${month} · ${hour}:${minute} ${zone}`;
}
