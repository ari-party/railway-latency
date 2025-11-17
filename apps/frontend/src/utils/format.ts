export function formatNumber(options?: Intl.NumberFormatOptions) {
  const formatter = new Intl.NumberFormat(undefined, options);
  return (value: number) => formatter.format(value);
}

export function formatDate(options?: Intl.DateTimeFormatOptions) {
  const formatter = new Intl.DateTimeFormat(undefined, options);
  return (value: Date) => formatter.format(value);
}
