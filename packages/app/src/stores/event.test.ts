import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  createEvent,
  createEventRecord,
  deleteEventRecord,
  fetchEvents,
} from '@/service/event';
import { isLocalMode } from '@/lib/serviceRouter';
import { useEventStore } from './event';

vi.mock('@/lib/serviceRouter', () => ({
  isLocalMode: vi.fn(() => false),
}));

vi.mock('@/service/event', () => ({
  createEvent: vi.fn(),
  createEventRecord: vi.fn(),
  deleteEvent: vi.fn(),
  deleteEventRecord: vi.fn(),
  fetchEventRecords: vi.fn(),
  fetchEvents: vi.fn(),
  updateEvent: vi.fn(),
  updateEventRecord: vi.fn(),
}));

const sourceEvent = {
  id: 'e1',
  name: '喝水',
  emoji: '💧',
  unit: 'ml',
  defaultAmount: 200,
  sortOrder: 0,
};

const sourceRecord = {
  id: 'r1',
  eventId: 'e1',
  eventName: '喝水',
  emoji: '💧',
  occurredAt: 1_760_000_000_000,
  date: '2026-10-07',
  note: '饭后',
  amount: 200,
};

const targetEvent = {
  ...sourceEvent,
  id: 'e2',
  sortOrder: 0,
};

const movedRecord = {
  ...sourceRecord,
  id: 'r2',
  eventId: 'e2',
};

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.mocked(isLocalMode).mockReturnValue(false);
  vi.mocked(fetchEvents).mockResolvedValue([]);
  vi.mocked(createEvent).mockResolvedValue(targetEvent);
  vi.mocked(createEventRecord).mockResolvedValue(movedRecord);
  vi.mocked(deleteEventRecord).mockResolvedValue(undefined);
});

describe('moveRecordToFamily', () => {
  it('目标家人已有同名事件时复用，并删除原记录', async () => {
    vi.mocked(fetchEvents).mockResolvedValue([targetEvent]);
    const store = useEventStore();
    store.records = [sourceRecord];

    const result = await store.moveRecordToFamily(sourceRecord, sourceEvent, 'baby');

    expect(fetchEvents).toHaveBeenCalledWith('baby');
    expect(createEvent).not.toHaveBeenCalled();
    expect(createEventRecord).toHaveBeenCalledWith({
      familyId: 'baby',
      eventId: 'e2',
      occurredAt: sourceRecord.occurredAt,
      note: sourceRecord.note,
      amount: sourceRecord.amount,
    });
    expect(deleteEventRecord).toHaveBeenCalledWith('r1');
    expect(store.records).toEqual([]);
    expect(result).toEqual(movedRecord);
  });

  it('目标家人没有同名事件时先补建事件', async () => {
    const store = useEventStore();

    await store.moveRecordToFamily(sourceRecord, sourceEvent, 'baby');

    expect(createEvent).toHaveBeenCalledWith('baby', {
      name: sourceEvent.name,
      emoji: sourceEvent.emoji,
      unit: sourceEvent.unit,
      defaultAmount: sourceEvent.defaultAmount,
    });
    expect(createEventRecord).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: targetEvent.id }),
    );
  });

  it('删除源记录失败时回滚目标记录并保留原记录', async () => {
    const sourceError = new Error('delete source failed');
    vi.mocked(fetchEvents).mockResolvedValue([targetEvent]);
    vi.mocked(deleteEventRecord)
      .mockRejectedValueOnce(sourceError)
      .mockResolvedValueOnce(undefined);
    const store = useEventStore();
    store.records = [sourceRecord];

    await expect(
      store.moveRecordToFamily(sourceRecord, sourceEvent, 'baby'),
    ).rejects.toBe(sourceError);

    expect(deleteEventRecord).toHaveBeenNthCalledWith(1, 'r1');
    expect(deleteEventRecord).toHaveBeenNthCalledWith(2, 'r2');
    expect(store.records).toEqual([sourceRecord]);
  });

  it('目标就是当前家人时不执行任何写入', async () => {
    const store = useEventStore();

    await expect(
      store.moveRecordToFamily(sourceRecord, sourceEvent, store.currentFamilyId),
    ).resolves.toBeNull();
    expect(fetchEvents).not.toHaveBeenCalled();
    expect(createEventRecord).not.toHaveBeenCalled();
  });
});

describe('seedDefaultEvents', () => {
  it('离线模式忽略远程遗留标记并导入默认事件', async () => {
    vi.mocked(isLocalMode).mockReturnValue(true);
    localStorage.setItem('event_seeded_default', '1');
    vi.mocked(createEvent).mockImplementation(async (_familyId, data) => ({
      id: `seed-${data.name}`,
      name: data.name,
      emoji: data.emoji,
      unit: data.unit || '',
      defaultAmount: data.defaultAmount ?? null,
      sortOrder: 0,
    }));
    const store = useEventStore();

    const count = await store.seedDefaultEvents();

    expect(count).toBe(3);
    expect(createEvent).toHaveBeenCalledTimes(3);
    expect(localStorage.getItem('event_seeded_local_default')).toBe('1');
  });

  it('远程模式兼容旧初始化标记，不重复导入', async () => {
    localStorage.setItem('event_seeded_default', '1');
    const store = useEventStore();

    const count = await store.seedDefaultEvents();

    expect(count).toBe(0);
    expect(createEvent).not.toHaveBeenCalled();
    expect(localStorage.getItem('event_seeded_server_default')).toBe('1');
  });

  it('离线模式已经初始化过时不再补种', async () => {
    vi.mocked(isLocalMode).mockReturnValue(true);
    localStorage.setItem('event_seeded_local_default', '1');
    const store = useEventStore();

    const count = await store.seedDefaultEvents();

    expect(count).toBe(0);
    expect(createEvent).not.toHaveBeenCalled();
  });
});
