import { describe, expect, it } from 'vitest';
import { buildScheduleExceptionPayload, normalizeScheduleRows, updateScheduleRow } from './schedule';

describe('schedule contracts', () => {
  it('submits skip using the backend type field', () => {
    const payload = buildScheduleExceptionPayload({ exception_date: '2026-11-10', reason: 'Libur', wake_time: '08:00' });
    expect(payload).toEqual({ exception_date: '2026-11-10', reason: 'Libur', type: 'skip' });
    expect(payload).not.toHaveProperty('is_cancelled');
  });

  it('submits override times only for override', () => {
    expect(buildScheduleExceptionPayload({ exception_date: '2026-11-10', reason: 'Ujian', type: 'override', wake_time: '08:00', shutdown_time: '12:00' }))
      .toMatchObject({ type: 'override', wake_time: '08:00', shutdown_time: '12:00' });
  });

  it('keeps missing weekdays editable', () => {
    const rows = updateScheduleRow(normalizeScheduleRows([]), 0, { is_active: true, wake_time: '09:00' });
    expect(rows.find((row) => row.day_of_week === 0)).toMatchObject({ is_active: true, wake_time: '09:00' });
  });
});
