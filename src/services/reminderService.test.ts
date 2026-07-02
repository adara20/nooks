import { describe, it, expect } from 'vitest';
import { computeNextDueDate, isDue } from './reminderService';
import { createReminder } from '../tests/factories';

describe('reminderService: computeNextDueDate', () => {
  it('advances by a 1-day interval', () => {
    const next = computeNextDueDate(new Date('2026-07-02T00:00:00Z'), 1);
    expect(next.toISOString().slice(0, 10)).toBe('2026-07-03');
  });

  it('advances by a large interval (35 days)', () => {
    const next = computeNextDueDate(new Date('2026-07-02T00:00:00Z'), 35);
    expect(next.toISOString().slice(0, 10)).toBe('2026-08-06');
  });

  it('rolls over correctly across multiple consecutive cycles', () => {
    let date = new Date('2026-01-01T00:00:00Z');
    for (let i = 0; i < 3; i++) {
      date = computeNextDueDate(date, 5);
    }
    expect(date.toISOString().slice(0, 10)).toBe('2026-01-16'); // 3 x 5 days
  });

  it('does not mutate the input date', () => {
    const original = new Date('2026-07-02T00:00:00Z');
    const originalTime = original.getTime();
    computeNextDueDate(original, 10);
    expect(original.getTime()).toBe(originalTime);
  });

  it('a zero interval returns the same date (guard: callers must validate intervalDays > 0)', () => {
    const start = new Date('2026-07-02T00:00:00Z');
    const next = computeNextDueDate(start, 0);
    expect(next.toISOString().slice(0, 10)).toBe('2026-07-02');
  });

  it('a negative interval moves the date backward rather than throwing', () => {
    const next = computeNextDueDate(new Date('2026-07-02T00:00:00Z'), -5);
    expect(next.toISOString().slice(0, 10)).toBe('2026-06-27');
  });
});

describe('reminderService: isDue', () => {
  it('is due when nextDueDate is in the past', () => {
    const reminder = createReminder({ nextDueDate: new Date('2026-01-01') });
    expect(isDue(reminder, new Date('2026-07-02'))).toBe(true);
  });

  it('is due when nextDueDate is exactly now', () => {
    const now = new Date('2026-07-02T08:00:00Z');
    const reminder = createReminder({ nextDueDate: new Date('2026-07-02T08:00:00Z') });
    expect(isDue(reminder, now)).toBe(true);
  });

  it('is not due when nextDueDate is in the future', () => {
    const reminder = createReminder({ nextDueDate: new Date('2026-12-01') });
    expect(isDue(reminder, new Date('2026-07-02'))).toBe(false);
  });

  it('a paused (inactive) reminder is never due, even if overdue', () => {
    const reminder = createReminder({ nextDueDate: new Date('2020-01-01'), active: false });
    expect(isDue(reminder, new Date('2026-07-02'))).toBe(false);
  });

  it('defaults `now` to the current time when not provided', () => {
    const pastReminder = createReminder({ nextDueDate: new Date('2000-01-01') });
    expect(isDue(pastReminder)).toBe(true);
  });
});
