import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';
import { isLocalMode } from '@/lib/serviceRouter';
import { applyOrder, dateKey, rangeToDates, type EventRangeKey } from '@/composables/useEventStats';
import {
  DEFAULT_EVENT_TEMPLATES,
  filterNewTemplates,
  type EventTemplate,
} from '@/constants/eventTemplates';
import {
  createEvent,
  createEventRecord,
  deleteEvent,
  deleteEventRecord,
  fetchEventRecords,
  fetchEvents,
  updateEvent,
  updateEventRecord,
  type EventItem,
  type EventRecordItem,
} from '@/service/event';

export interface EventFormPayload {
  name: string;
  emoji: string;
  unit: string;
  defaultAmount: number | null;
}

/** 记录失败时的文案：离线与在线要能区分出问题出在哪 */
export function recordFailedMessage(): string {
  return isLocalMode() ? '保存到本地失败，这次没有记录成功' : '网络异常，这次没有记录成功';
}

export const useEventStore = defineStore('event', () => {
  const currentFamilyId = useLocalStorage('event_current_family', 'default');

  const events = ref<EventItem[]>([]);
  const records = ref<EventRecordItem[]>([]);
  const rangeKey = ref<EventRangeKey>('7d');

  const loading = ref(false);
  const loadError = ref('');
  const saving = ref(false);
  const recording = ref(false);

  /** 今日记录（统计范围始终包含今天） */
  const todayRecords = computed(() => {
    const key = dateKey(new Date());
    return records.value.filter((r) => (r.date || dateKey(r.occurredAt)) === key);
  });

  const activeEvents = computed(() => events.value);

  const hasRecords = computed(() => records.value.length > 0);

  async function loadEvents() {
    events.value = await fetchEvents(currentFamilyId.value);
    return events.value;
  }

  async function loadRecords(key: EventRangeKey = rangeKey.value) {
    rangeKey.value = key;
    const { startDate, endDate } = rangeToDates(key);
    records.value = await fetchEventRecords(currentFamilyId.value, { startDate, endDate });
    return records.value;
  }

  /** 同时加载事件与记录；任一失败都置为整块错误态 */
  async function loadAll(key: EventRangeKey = rangeKey.value) {
    loading.value = true;
    loadError.value = '';
    try {
      await Promise.all([loadEvents(), loadRecords(key)]);
    } catch (err) {
      console.error('Failed to load events', err);
      loadError.value = isLocalMode() ? '读取本地数据失败，请重试' : '加载失败，请检查网络后重试';
    } finally {
      loading.value = false;
    }
  }

  async function reload() {
    return loadAll(rangeKey.value);
  }

  async function setFamily(familyId: string) {
    currentFamilyId.value = familyId;
    await loadAll();
  }

  function upsertRecord(record: EventRecordItem) {
    const index = records.value.findIndex((r) => r.id === record.id);
    if (index !== -1) records.value.splice(index, 1, record);
    else records.value.push(record);
  }

  function removeRecordById(id: string) {
    records.value = records.value.filter((r) => r.id !== id);
  }

  /** 立即落库一次记录；失败时抛出，由调用方决定提示文案 */
  async function record(eventId: string, amount: number | null = null, note = '') {
    if (recording.value) return null;
    recording.value = true;
    try {
      const created = await createEventRecord({
        familyId: currentFamilyId.value,
        eventId,
        occurredAt: Date.now(),
        note,
        amount,
      });
      upsertRecord(created);
      return created;
    } finally {
      recording.value = false;
    }
  }

  /** 补记面板里改数量 / 备注 */
  async function patchRecord(id: string, patch: { amount?: number | null; note?: string }) {
    const updated = await updateEventRecord({ id, ...patch });
    upsertRecord(updated);
    return updated;
  }

  async function undoRecord(id: string) {
    await deleteEventRecord(id);
    removeRecordById(id);
  }

  /**
   * 把刚刚记录的这条挪到另一个家人：
   * 目标家人里没有同名事件就按原事件的图标 / 单位 / 默认值补一个，
   * 先在新家人写入、成功后再删掉原记录，中途失败也不会丢数据。
   */
  async function moveRecordToFamily(
    record: EventRecordItem,
    event: EventItem,
    familyId: string,
  ) {
    if (familyId === currentFamilyId.value) return null;

    const targetEvents = await fetchEvents(familyId);
    let targetEvent = targetEvents.find((e) => e.name === event.name);
    if (!targetEvent) {
      targetEvent = await createEvent(familyId, {
        name: event.name,
        emoji: event.emoji,
        unit: event.unit,
        defaultAmount: event.defaultAmount,
      });
    }

    const created = await createEventRecord({
      familyId,
      eventId: targetEvent.id,
      occurredAt: record.occurredAt,
      note: record.note,
      amount: record.amount,
    });
    try {
      await deleteEventRecord(record.id);
    } catch (err) {
      // 写入目标记录后删源失败时，尽量回滚目标记录，避免同一条记录被算两次
      try {
        await deleteEventRecord(created.id);
      } catch (cleanupErr) {
        console.error('Failed to clean up moved record', cleanupErr);
      }
      throw err;
    }
    removeRecordById(record.id);
    return created;
  }

  async function saveEvent(payload: EventFormPayload, id?: string) {
    if (id) {
      const updated = await updateEvent({
        id,
        name: payload.name,
        emoji: payload.emoji,
        unit: payload.unit,
        defaultAmount: payload.defaultAmount,
      });
      const index = events.value.findIndex((e) => e.id === id);
      if (index !== -1) events.value.splice(index, 1, updated);
      return updated;
    }
    const created = await createEvent(currentFamilyId.value, payload);
    events.value.push(created);
    return created;
  }

  async function removeEvent(id: string) {
    await deleteEvent(id);
    // 历史记录保留（服务端冗余了事件名与 emoji 快照），统计里仍然可见
    events.value = events.value.filter((e) => e.id !== id);
  }

  /** 一键导入常用模板：按名称去重，串行创建以保证 sortOrder 稳定 */
  async function importTemplates(templates: EventTemplate[]) {
    const pending = filterNewTemplates(
      events.value.map((e) => e.name),
      templates,
    );
    const created: EventItem[] = [];
    for (const template of pending) {
      const item = await createEvent(currentFamilyId.value, {
        name: template.name,
        emoji: template.emoji,
        unit: template.unit,
        defaultAmount: template.defaultAmount,
      });
      events.value.push(item);
      created.push(item);
    }
    return created;
  }

  const seededStorageKey = (familyId: string) => `event_seeded_${familyId}`;

  /**
   * 首次进入该家人、且一条事件都没有时，自动创建默认的几个事件。
   * 用 localStorage 打标：用户之后手动全删，也不会被再补回来。
   */
  async function seedDefaultEvents() {
    const key = seededStorageKey(currentFamilyId.value);
    if (localStorage.getItem(key) === '1') return 0;
    if (events.value.length) {
      localStorage.setItem(key, '1');
      return 0;
    }
    try {
      const created = await importTemplates(DEFAULT_EVENT_TEMPLATES);
      localStorage.setItem(key, '1');
      return created.length;
    } catch (err) {
      console.error('Failed to seed default events', err);
      return 0;
    }
  }

  /** 拖拽排序：先本地生效，再按新顺序回写 sortOrder */
  async function reorder(orderedIds: string[]) {
    events.value = applyOrder(events.value, orderedIds);
    await Promise.all(
      events.value.map((e, index) => updateEvent({ id: e.id, sortOrder: index })),
    );
  }

  function reset() {
    events.value = [];
    records.value = [];
    loadError.value = '';
  }

  return {
    currentFamilyId,
    events,
    records,
    rangeKey,
    loading,
    loadError,
    saving,
    recording,
    activeEvents,
    todayRecords,
    hasRecords,
    loadEvents,
    loadRecords,
    loadAll,
    reload,
    setFamily,
    record,
    patchRecord,
    undoRecord,
    moveRecordToFamily,
    saveEvent,
    removeEvent,
    importTemplates,
    seedDefaultEvents,
    reorder,
    reset,
  };
});
