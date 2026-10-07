import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EVENT_TEMPLATES,
  EVENT_TEMPLATES,
  EVENT_TEMPLATE_GROUPS,
  filterNewTemplates,
  type EventTemplate,
} from './eventTemplates'

function tpl(overrides: Partial<EventTemplate> = {}): EventTemplate {
  return {
    key: 'k',
    name: '事件',
    emoji: '📌',
    unit: '',
    defaultAmount: null,
    ...overrides,
  }
}

describe('默认事件', () => {
  it('只保留人人适用的几个', () => {
    expect(DEFAULT_EVENT_TEMPLATES.map((t) => t.name)).toEqual(['喝水', '大便', '小便'])
  })

  it('大便 / 小便是两个独立事件', () => {
    const names = DEFAULT_EVENT_TEMPLATES.map((t) => t.name)
    expect(names).toContain('大便')
    expect(names).toContain('小便')
    expect(names).not.toContain('上厕所')
  })
})

describe('模板目录', () => {
  it('key 全局唯一', () => {
    const keys = EVENT_TEMPLATES.map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('分组标题不重复，且没有「上厕所」这种笼统事件', () => {
    expect(new Set(EVENT_TEMPLATE_GROUPS.map((g) => g.title)).size).toBe(
      EVENT_TEMPLATE_GROUPS.length,
    )
    expect(EVENT_TEMPLATES.some((t) => t.name === '上厕所')).toBe(false)
  })

  it('设置了单位才带默认值', () => {
    for (const item of EVENT_TEMPLATES) {
      if (!item.unit) expect(item.defaultAmount).toBeNull()
    }
  })
})

describe('filterNewTemplates', () => {
  it('按名称去重，已存在的跳过', () => {
    const result = filterNewTemplates(['喝水', '大便'], EVENT_TEMPLATES)
    expect(result.some((t) => t.name === '喝水')).toBe(false)
    expect(result.some((t) => t.name === '小便')).toBe(true)
  })

  it('忽略首尾空格与入参里的重复名称', () => {
    const result = filterNewTemplates(['喝水 '], [tpl({ name: '喝水' }), tpl({ key: 'a', name: '新事件' })])
    expect(result.map((t) => t.name)).toEqual(['新事件'])
  })

  it('一次导入里同名的只保留第一条', () => {
    const result = filterNewTemplates(
      [],
      [tpl({ key: 'a', name: '同一个' }), tpl({ key: 'b', name: '同一个' })],
    )
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('a')
  })

  it('空名称跳过', () => {
    expect(filterNewTemplates([], [tpl({ name: '  ' })])).toHaveLength(0)
  })
})
