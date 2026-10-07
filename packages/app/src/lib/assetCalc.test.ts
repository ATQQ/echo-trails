import { describe, expect, it } from 'vitest'
import {
  calcAssetFields,
  calcAssetStats,
  calcProfit,
  resolveDaysHeld,
  type AssetCalcInput,
} from './assetCalc'

const DAY_MS = 1000 * 60 * 60 * 24
const NOW = new Date(2026, 9, 7, 12, 0, 0).getTime()

function asset(overrides: Partial<AssetCalcInput> = {}): AssetCalcInput {
  return {
    status: 'active',
    price: 1000,
    purchaseDate: NOW - 100 * DAY_MS,
    calcType: 'day',
    usageCount: 0,
    ...overrides,
  }
}

describe('resolveDaysHeld', () => {
  it('已卖出且有卖出时间时冻结到卖出时间', () => {
    const purchaseDate = NOW - 100 * DAY_MS
    const soldDate = NOW - 40 * DAY_MS
    expect(resolveDaysHeld(purchaseDate, soldDate, NOW)).toBe(60)
  })

  it('缺少卖出时间时按当前时间计算', () => {
    const purchaseDate = NOW - 100 * DAY_MS
    expect(resolveDaysHeld(purchaseDate, undefined, NOW)).toBe(100)
    expect(resolveDaysHeld(purchaseDate, 0, NOW)).toBe(100)
  })

  it('已退役且有退役时间时冻结到退役时间', () => {
    const purchaseDate = NOW - 100 * DAY_MS
    const retiredDate = NOW - 30 * DAY_MS
    expect(resolveDaysHeld(purchaseDate, undefined, NOW, retiredDate)).toBe(70)
  })
})

describe('calcAssetFields', () => {
  it('已卖出的按天资产用冻结天数计算日均成本', () => {
    const purchaseDate = NOW - 100 * DAY_MS
    const soldDate = NOW - 40 * DAY_MS
    const fields = calcAssetFields(
      asset({ status: 'sold', price: 1000, purchaseDate, soldDate, soldPrice: 600, calcType: 'day' }),
      NOW
    )

    expect(fields.daysHeld).toBe(60)
    expect(fields.costPerDay).toBeCloseTo(1000 / 60)
    expect(fields.profit).toBe(-400)
  })

  it('已卖出但缺少卖出时间时仍按当前时间兜底，且不产生盈亏', () => {
    const purchaseDate = NOW - 100 * DAY_MS
    const fields = calcAssetFields(
      asset({ status: 'sold', price: 1000, purchaseDate, calcType: 'day' }),
      NOW
    )

    expect(fields.daysHeld).toBe(100)
    expect(fields.profit).toBeUndefined()
  })

  it('按次资产卖出后保留按次成本', () => {
    const fields = calcAssetFields(
      asset({ status: 'sold', price: 900, usageCount: 3, calcType: 'count', soldPrice: 1200 }),
      NOW
    )

    expect(fields.costPerUse).toBe(300)
    expect(fields.costPerDay).toBe(0)
    expect(fields.profit).toBe(300)
  })

  it('已退役资产用退役时间冻结持有天数与日均成本', () => {
    const purchaseDate = NOW - 100 * DAY_MS
    const retiredDate = NOW - 25 * DAY_MS
    const fields = calcAssetFields(
      asset({ status: 'retired', price: 800, purchaseDate, retiredDate, calcType: 'day' }),
      NOW
    )

    expect(fields.daysHeld).toBe(75)
    expect(fields.costPerDay).toBeCloseTo(800 / 75)
    expect(fields.profit).toBeUndefined()
  })

  it('已退役但缺少退役时间时按当前时间兜底', () => {
    const purchaseDate = NOW - 100 * DAY_MS
    const fields = calcAssetFields(
      asset({ status: 'retired', price: 800, purchaseDate, calcType: 'day' }),
      NOW
    )

    expect(fields.daysHeld).toBe(100)
  })
})

describe('calcProfit', () => {
  it('只有已卖出且有卖出价格时才返回盈亏', () => {
    expect(calcProfit('active', 1000, 1200)).toBeUndefined()
    expect(calcProfit('sold', 1000, undefined)).toBeUndefined()
    expect(calcProfit('sold', 1000, 0)).toBe(-1000)
    expect(calcProfit('sold', 1000, 1200)).toBe(200)
  })
})

describe('calcAssetStats', () => {
  it('总资产估值与日均成本排除已卖出，盈亏单独汇总', () => {
    const stats = calcAssetStats(
      [
        asset({ status: 'active', price: 1000, purchaseDate: NOW - 100 * DAY_MS }),
        asset({
          status: 'retired',
          price: 500,
          purchaseDate: NOW - 100 * DAY_MS,
          retiredDate: NOW - 50 * DAY_MS,
        }),
        asset({ status: 'sold', price: 1000, purchaseDate: NOW - 100 * DAY_MS, soldPrice: 600 }),
        asset({ status: 'sold', price: 800, purchaseDate: NOW - 100 * DAY_MS, soldPrice: 1500 }),
        // 历史卖出数据没有卖出价格，不参与盈亏汇总
        asset({ status: 'sold', price: 300, purchaseDate: NOW - 100 * DAY_MS }),
      ],
      NOW
    )

    expect(stats.totalValue).toBe(1500)
    expect(stats.dailyCost).toBeCloseTo(1000 / 100 + 500 / 50)
    expect(stats.realizedProfit).toBe(300)
  })

  it('没有数据时返回 0', () => {
    expect(calcAssetStats([], NOW)).toEqual({ totalValue: 0, dailyCost: 0, realizedProfit: 0 })
  })
})
