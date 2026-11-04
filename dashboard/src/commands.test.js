import { describe, expect, it } from 'vitest';
import { assertCommandAccepted, buildCommandPayload } from './commands';

describe('buildCommandPayload', () => {
  it('targets every selected PC exactly once', () => {
    expect(buildCommandPayload({ action: 'message', targetType: 'pc', pcIds: [101, 102, 102], reason: 'test' }))
      .toEqual({ action: 'message', target_type: 'pc', pc_ids: [101, 102], reason: 'test' });
  });

  it('keeps single PC, lab, and all semantics', () => {
    expect(buildCommandPayload({ action: 'lock', targetType: 'pc', targetId: 7 }))
      .toMatchObject({ target_type: 'pc', target_id: 7 });
    expect(buildCommandPayload({ action: 'lock', targetType: 'lab', targetId: 2 }))
      .toMatchObject({ target_type: 'lab', target_id: 2 });
    expect(buildCommandPayload({ action: 'lock', targetType: 'all' }))
      .toMatchObject({ target_type: 'all' });
  });

  it('never turns an empty PC selection into a broadcast', () => {
    expect(() => buildCommandPayload({ action: 'shutdown', targetType: 'pc', pcIds: [] })).toThrow();
  });
});

describe('assertCommandAccepted', () => {
  it('does not turn explicit dispatch failures into success', () => {
    expect(() => assertCommandAccepted({ success: false, message: 'publish failed' })).toThrow('publish failed');
    expect(() => assertCommandAccepted({ results: [{ status: 'failed' }] })).toThrow();
  });

  it('accepts a server acknowledgement without claiming PC execution', () => {
    expect(assertCommandAccepted({ data: { published_count: 2 } })).toBeTruthy();
  });
});
