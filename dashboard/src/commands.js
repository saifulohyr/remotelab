export function buildCommandPayload({
  action,
  targetType,
  targetId,
  pcIds,
  ...fields
}) {
  if (targetType === 'pc') {
    const requestedIds = pcIds === undefined
      ? (targetId === undefined || targetId === null ? [] : [targetId])
      : pcIds;
    const ids = [...new Set((requestedIds || []).map(Number))];

    if (ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new Error('Pilih minimal satu PC yang valid. Perintah tidak disiarkan.');
    }

    return {
      action,
      target_type: 'pc',
      ...(ids.length === 1 ? { target_id: ids[0] } : { pc_ids: ids }),
      ...fields,
    };
  }

  if (targetType === 'all') {
    return { action, target_type: 'all', ...fields };
  }

  if (targetType === 'lab') {
    if (targetId === undefined || targetId === null) {
      throw new Error('Lab target belum dipilih. Perintah tidak disiarkan.');
    }
    return { action, target_type: 'lab', target_id: targetId, ...fields };
  }

  throw new Error('Jenis target perintah tidak valid.');
}

function hasEntries(value) {
  if (!value) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

export function assertCommandAccepted(response) {
  const results = [
    ...(Array.isArray(response?.results) ? response.results : []),
    ...(Array.isArray(response?.data?.results) ? response.data.results : []),
  ];
  const hasFailedResults = results.some((result) =>
    ['failed', 'error', 'rejected', 'rejected_expired'].includes(result?.status)
  );
  const hasErrors =
    response?.success === false ||
    ['failed', 'error', 'rejected'].includes(response?.status) ||
    Boolean(response?.error) ||
    hasEntries(response?.errors) ||
    hasEntries(response?.failures) ||
    Number(response?.failed_count) > 0 ||
    hasFailedResults;

  if (hasErrors) {
    const detail = Array.isArray(response?.errors)
      ? response.errors.filter((error) => typeof error === 'string').join('; ')
      : '';
    throw new Error(
      detail || response?.message || 'Perintah ditolak atau sebagian target gagal. Tidak ada status sukses penuh.'
    );
  }

  return response;
}
