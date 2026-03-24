const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const monthDayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

export function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00`);
}

export function getTodayKey(): string {
  return getDateKey(new Date());
}

export function getWeekDates(anchorDate = new Date()): Date[] {
  const start = new Date(anchorDate);
  const day = start.getDay();
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - day);

  return Array.from({ length: 7 }, (_, index) => {
    const next = new Date(start);
    next.setDate(start.getDate() + index);
    return next;
  });
}

export function getWeekDateKeys(anchorDate = new Date()): string[] {
  return getWeekDates(anchorDate).map(getDateKey);
}

export function formatWeekday(dateKey: string): string {
  return weekdayFormatter.format(parseDateKey(dateKey));
}

export function formatMonthDay(dateKey: string): string {
  return monthDayFormatter.format(parseDateKey(dateKey));
}

export function isTodayKey(dateKey: string): boolean {
  return dateKey === getTodayKey();
}
