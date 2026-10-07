import { computed, unref, type ComputedRef, type Ref } from 'vue';
import type { EventItem, EventRecordItem } from '@/service/event';

/** 记录数量权重：没记数量时按 1 次计入 */
export function recordWeight(record: Pick<EventRecordItem, 'amount'>): number {
  const n = Number(record.amount);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** 本地日期 key（YYYY-MM-DD），避免 toISOString 的时区偏移 */
export function dateKey(date: Date | number | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfDay(date: Date | number | string): Date {
  const d = date instanceof Date ? new Date(date.getTime()) : new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date | number | string, days: number): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** 今天总记录数 */
export function countToday(records: EventRecordItem[], today: Date = new Date()): number {
  const key = dateKey(today);
  return records.filter((r) => (r.date || dateKey(r.occurredAt)) === key).length;
}

/** 今天某个事件的记录次数 */
export function countTodayOf(
  records: EventRecordItem[],
  eventId: string,
  today: Date = new Date(),
): number {
  const key = dateKey(today);
  return records.filter((r) => r.eventId === eventId && (r.date || dateKey(r.occurredAt)) === key)
    .length;
}

/** 连续记录天数：从今天（今天没记则从昨天）往前数连续有记录的天数 */
export function streakDays(records: EventRecordItem[], today: Date = new Date()): number {
  if (!records.length) return 0;
  const days = new Set(records.map((r) => r.date || dateKey(r.occurredAt)));
  let n = 0;
  for (let i = 0; i < 400; i++) {
    if (days.has(dateKey(addDays(today, -i)))) {
      n++;
    } else if (i > 0) {
      break;
    }
  }
  return n;
}

export interface DailyPoint {
  key: string;
  label: string;
  value: number;
  isToday: boolean;
}

/** 最近 N 天的每日次数序列（含 0 补齐，按时间升序） */
export function dailySeries(
  records: EventRecordItem[],
  days: number,
  today: Date = new Date(),
): DailyPoint[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    const key = r.date || dateKey(r.occurredAt);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const out: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const key = dateKey(d);
    out.push({
      key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      value: counts.get(key) || 0,
      isToday: i === 0,
    });
  }
  return out;
}

/** 24 小时分布 */
export function hourSeries(records: EventRecordItem[]): number[] {
  const arr = new Array(24).fill(0) as number[];
  for (const r of records) {
    const h = new Date(r.occurredAt).getHours();
    if (h >= 0 && h < 24) arr[h]++;
  }
  return arr;
}

export interface EventTotal {
  id: string;
  name: string;
  emoji: string;
  value: number;
}

/** 各事件记录占比（按次数降序） */
export function eventTotals(records: EventRecordItem[], events: EventItem[]): EventTotal[] {
  const map = new Map<string, number>();
  for (const r of records) {
    map.set(r.eventId, (map.get(r.eventId) || 0) + 1);
  }
  return [...map.entries()]
    .map(([id, value]) => {
      const ev = events.find((e) => e.id === id);
      return {
        id,
        name: ev ? ev.name : '已删除事件',
        emoji: ev?.emoji || '📌',
        value,
      };
    })
    .sort((a, b) => b.value - a.value);
}

export interface RecordGroup {
  date: string;
  items: EventRecordItem[];
}

/** 按天分组（倒序），组内按时间倒序 */
export function groupByDate(records: EventRecordItem[]): RecordGroup[] {
  const map = new Map<string, EventRecordItem[]>();
  for (const r of records) {
    const key = r.date || dateKey(r.occurredAt);
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()]
    .map(([date, items]) => ({
      date,
      items: items.slice().sort((a, b) => b.occurredAt - a.occurredAt),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function formatAmount(amount: number | null | undefined, unit?: string): string {
  if (amount == null) return unit ? `1${unit}` : '1 次';
  return unit ? `${amount}${unit}` : `${amount} 次`;
}

/** 按事件 / 时间范围筛选记录 */
export function filterRecords(
  records: EventRecordItem[],
  options: { eventId?: string; startDate?: string; endDate?: string } = {},
): EventRecordItem[] {
  const { eventId, startDate, endDate } = options;
  return records.filter((r) => {
    if (eventId && eventId !== 'all' && r.eventId !== eventId) return false;
    const key = r.date || dateKey(r.occurredAt);
    if (startDate && key < startDate) return false;
    if (endDate && key > endDate) return false;
    return true;
  });
}

/** 按拖拽后的 id 顺序重排事件（返回新数组，不修改入参） */
export function applyOrder(events: EventItem[], orderedIds: string[]): EventItem[] {
  const index = new Map(orderedIds.map((id, i) => [id, i]));
  return events
    .slice()
    .sort((a, b) => {
      const ai = index.has(a.id) ? (index.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
      const bi = index.has(b.id) ? (index.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
}

export function sortByOrder(events: EventItem[]): EventItem[] {
  return events
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** 统计范围：近 7 / 30 天 / 全部 */
export type EventRangeKey = '7d' | '30d' | 'all';

export function rangeToDates(
  key: EventRangeKey,
  today: Date = new Date(),
): { startDate?: string; endDate?: string } {
  if (key === 'all') return {};
  const days = key === '7d' ? 7 : 30;
  return {
    startDate: dateKey(addDays(today, -(days - 1))),
    endDate: dateKey(today),
  };
}

export function useEventStats(
  events: Ref<EventItem[]> | ComputedRef<EventItem[]>,
  records: Ref<EventRecordItem[]> | ComputedRef<EventRecordItem[]>,
  filterEventId: Ref<string>,
  chartDays: Ref<number>,
) {
  // records 已按时间范围取好，这里只做事件维度筛选
  const scoped = computed(() => filterRecords(unref(records), { eventId: unref(filterEventId) }));

  return {
    scoped,
    totalCount: computed(() => scoped.value.length),
    dayCount: computed(() => new Set(scoped.value.map((r) => r.date || dateKey(r.occurredAt))).size),
    avgPerDay: computed(() => {
      const days = new Set(scoped.value.map((r) => r.date || dateKey(r.occurredAt))).size;
      return days ? (scoped.value.length / days).toFixed(1) : '0';
    }),
    daily: computed(() => dailySeries(scoped.value, unref(chartDays))),
    hours: computed(() => hourSeries(scoped.value)),
    totals: computed(() => eventTotals(scoped.value, unref(events))),
    groups: computed(() => groupByDate(scoped.value)),
  };
}
