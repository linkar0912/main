// Admin timestamps use UTC so server rendering and browser hydration agree,
// and operators in different time zones see the same event time.
export function formatAdminDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export function formatAdminDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toISOString().slice(0, 10);
}
