export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0];

export function createDefaultScheduleRows() {
  return WEEK_DAYS.map((dayOfWeek) => ({
    day_of_week: dayOfWeek,
    wake_time: '07:30',
    shutdown_time: '17:00',
    is_active: dayOfWeek >= 1 && dayOfWeek <= 5,
  }));
}

export function normalizeScheduleRows(rows = []) {
  return createDefaultScheduleRows().map((defaultRow) => ({
    ...defaultRow,
    ...(rows.find((row) => Number(row.day_of_week) === defaultRow.day_of_week) || {}),
  }));
}

export function updateScheduleRow(rows, dayIndex, changes) {
  return normalizeScheduleRows(rows).map((row) =>
    row.day_of_week === dayIndex ? { ...row, ...changes } : row
  );
}

export function buildScheduleExceptionPayload(values) {
  const payload = {
    exception_date: values.exception_date,
    reason: values.reason,
    type: values.type === 'override' ? 'override' : 'skip',
  };

  if (payload.type === 'override') {
    for (const field of ['wake_time', 'shutdown_time']) {
      if (values[field]) payload[field] = values[field];
    }
  }

  return payload;
}
