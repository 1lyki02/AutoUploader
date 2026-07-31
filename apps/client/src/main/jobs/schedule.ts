const MIN_SCHEDULE_LEAD_MS = 1000;

export function resolveBatchSchedule(
  scheduledAt: string | undefined,
  now = new Date(),
): Date {
  if (!scheduledAt) return now;

  const value = new Date(scheduledAt);
  if (Number.isNaN(value.getTime())) {
    throw new Error("Некорректная дата публикации");
  }
  if (value.getTime() < now.getTime() + MIN_SCHEDULE_LEAD_MS) {
    throw new Error("Время публикации должно быть в будущем");
  }
  return value;
}

export function isScheduledJobDue(scheduledAt: Date, now = new Date()): boolean {
  return scheduledAt.getTime() <= now.getTime();
}
