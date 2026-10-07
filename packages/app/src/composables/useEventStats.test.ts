import { describe, expect, it } from 'vitest'
import {
  applyOrder,
  countToday,
  countTodayOf,
  dailySeries,
  dateKey,
  eventTotals,
  filterRecords,
  formatAmount,
  groupByDate,
  hourSeries,
  recordWeight,
  sortByOrder,
  streakDays,
  rangeToDates,
} from './useEventStats'
import type { EventItem, EventRecordItem } from '@/service/event'

const TODAY = new Date(2026, 9, 6, 12, 0, 0) // 2026-10-06 周二

let seq = 0
function day(offset: number): string {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + offset)
  return dateKey(d)
}

function tsAt(dayOffset: number, hour: number): number {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

function rec(overrides: Partial<EventRecordItem> = {}): EventRecordItem {
  seq += 1
  return {
    id: `r${seq}`,
    eventId: 'e1',
    eventName: '喝水',
    emoji: '💧',
    occurredAt: tsAt(0, 9),
    date: day(0),
    note: '',
    amount: null,
    ...overrides,
  }
}

function event(overrides: Partial<EventItem> = {}): EventItem {
  return {
    id: 'e1',
    name: '喝水',
    emoji: '💧',
    unit: '',
    defaultAmount: null,
    sortOrder: 0,
    ...overrides,
  }
}

describe('recordWeight', () => {
  it('没记数量时按 1 次计入', () => {
    expect(recordWeight(rec({ amount: null }))).toBe(1)
  })

  it('0 / 负数 / 非法值都回退到 1', () => {
    expect(recordWeight(rec({ amount: 0 }))).toBe(1)
    expect(recordWeight(rec({ amount: -3 }))).toBe(1)
    expect(recordWeight(rec({ amount: Number.NaN }))).toBe(1)
  })

  it('保留有效的小数数量', () => {
    expect(recordWeight(rec({ amount: 2.5 }))).toBe(2.5)
  })
})

describe('countToday / countTodayOf', () => {
  const records = [
    rec({ eventId: 'e1', date: day(0) }),
    rec({ eventId: 'e2', date: day(0) }),
    rec({ eventId: 'e1', date: day(-1) }),
  ]

  it('统计今天的记录条数', () => {
    expect(countToday(records, TODAY)).toBe(2)
  })

  it('按事件统计今天次数', () => {
    expect(countTodayOf(records, 'e1', TODAY)).toBe(1)
    expect(countTodayOf(records, 'e2', TODAY)).toBe(1)
    expect(countTodayOf(records, 'e3', TODAY)).toBe(0)
  })

  it('没有 date 字段时从 occurredAt 推断', () => {
    const fallback = [rec({ date: '', occurredAt: tsAt(0, 8) })]
    expect(countToday(fallback, TODAY)).toBe(1)
  })
})

describe('streakDays', () => {
  it('从今天往前数连续天数', () => {
    const records = [rec({ date: day(0) }), rec({ date: day(-1) }), rec({ date: day(-2) })]
    expect(streakDays(records, TODAY)).toBe(3)
  })

  it('今天没记时从昨天往前数', () => {
    const records = [rec({ date: day(-1) }), rec({ date: day(-2) })]
    expect(streakDays(records, TODAY)).toBe(2)
  })

  it('中间断档就停在断点', () => {
    const records = [rec({ date: day(0) }), rec({ date: day(-2) })]
    expect(streakDays(records, TODAY)).toBe(1)
  })

  it('完全没有记录返回 0', () => {
    expect(streakDays([], TODAY)).toBe(0)
  })
})

describe('dailySeries', () => {
  it('补零并按时间升序，最后一天是今天', () => {
    const records = [rec({ date: day(0) }), rec({ date: day(-2) })]
    const series = dailySeries(records, 7, TODAY)
    expect(series).toHaveLength(7)
    expect(series[6].key).toBe(day(0))
    expect(series[6].isToday).toBe(true)
    expect(series[6].value).toBe(1)
    expect(series[4].value).toBe(1)
    expect(series[0].value).toBe(0)
    expect(series[6].label).toBe('10/6')
  })
})

describe('hourSeries', () => {
  it('按 24 小时分桶', () => {
    const records = [rec({ occurredAt: tsAt(0, 9) }), rec({ occurredAt: tsAt(0, 9) }), rec({ occurredAt: tsAt(-1, 21) })]
    const hours = hourSeries(records)
    expect(hours).toHaveLength(24)
    expect(hours[9]).toBe(2)
    expect(hours[21]).toBe(1)
    expect(hours[0]).toBe(0)
  })
})

describe('filterRecords', () => {
  const records = [
    rec({ eventId: 'e1', date: day(0) }),
    rec({ eventId: 'e2', date: day(-3) }),
    rec({ eventId: 'e1', date: day(-10) }),
  ]

  it('按事件筛选，all 表示全部', () => {
    expect(filterRecords(records, { eventId: 'e1' })).toHaveLength(2)
    expect(filterRecords(records, { eventId: 'all' })).toHaveLength(3)
    expect(filterRecords(records, { eventId: 'e2' })).toHaveLength(1)
  })

  it('按时间范围筛选（含边界）', () => {
    const scoped = filterRecords(records, { startDate: day(-3), endDate: day(0) })
    expect(scoped).toHaveLength(2)
  })
})

describe('eventTotals / groupByDate', () => {
  it('统计各事件占比，已删除事件也能兜底展示', () => {
    const records = [
      rec({ eventId: 'e1' }),
      rec({ eventId: 'e1' }),
      rec({ eventId: 'gone' }),
    ]
    const totals = eventTotals(records, [event({ id: 'e1', name: '喝水', emoji: '💧' })])
    expect(totals[0]).toMatchObject({ id: 'e1', value: 2 })
    expect(totals[1]).toMatchObject({ id: 'gone', name: '已删除事件', value: 1 })
  })

  it('按天倒序分组，组内按时间倒序', () => {
    const records = [rec({ date: day(0), occurredAt: tsAt(0, 8) }), rec({ date: day(-1) }), rec({ date: day(0), occurredAt: tsAt(0, 20) })]
    const groups = groupByDate(records)
    expect(groups.map((g) => g.date)).toEqual([day(0), day(-1)])
    expect(groups[0].items[0].occurredAt).toBe(tsAt(0, 20))
  })
})

describe('formatAmount', () => {
  it('空值按一次展示', () => {
    expect(formatAmount(null)).toBe('1 次')
    expect(formatAmount(null, 'ml')).toBe('1ml')
    expect(formatAmount(undefined)).toBe('1 次')
  })

  it('有单位拼单位，没单位按次数', () => {
    expect(formatAmount(2.5, 'ml')).toBe('2.5ml')
    expect(formatAmount(3, '次')).toBe('3次')
    expect(formatAmount(3)).toBe('3 次')
  })
})

describe('applyOrder / sortByOrder', () => {
  const events = [event({ id: 'a' }), event({ id: 'b' }), event({ id: 'c' })]

  it('按拖拽后的 id 顺序重排（返回新数组）', () => {
    const ordered = applyOrder(events, ['c', 'a', 'b'])
    expect(ordered.map((e) => e.id)).toEqual(['c', 'a', 'b'])
    expect(events.map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('未出现在顺序里的元素排到最后', () => {
    const ordered = applyOrder(events, ['b'])
    expect(ordered[0].id).toBe('b')
  })

  it('按 sortOrder 升序', () => {
    const list = [
      event({ id: 'a', sortOrder: 3 }),
      event({ id: 'b', sortOrder: 1 }),
      event({ id: 'c', sortOrder: 2 }),
    ]
    expect(sortByOrder(list).map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('rangeToDates', () => {
  it('近 7 天含今天共 7 天', () => {
    expect(rangeToDates('7d', TODAY)).toEqual({ startDate: day(-6), endDate: day(0) })
  })

  it('全部返回空范围', () => {
    expect(rangeToDates('all', TODAY)).toEqual({})
  })
})
