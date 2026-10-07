export const DAY_MS = 1000 * 60 * 60 * 24

export interface AssetCalcInput {
  status?: string
  price?: number | string | null
  purchaseDate?: number | string | null
  soldDate?: number | string | null
  soldPrice?: number | string | null
  retiredDate?: number | string | null
  usageCount?: number | string | null
  calcType?: string | null
}

export interface AssetDerivedFields {
  daysHeld: number
  costPerUse: number
  costPerDay: number
  profit?: number
}

export interface AssetStats {
  totalValue: number
  dailyCost: number
  realizedProfit: number
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : undefined
}

function toTimestamp(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  const time = new Date(value as string).getTime()
  return Number.isFinite(time) ? time : undefined
}

/**
 * 已卖出按卖出时间冻结，已退役按退役时间冻结；
 * 历史数据缺少对应时间时继续按当前时间计算。
 */
export function resolveDaysHeld(
  purchaseDate: number,
  soldDate?: number | null,
  now: number = Date.now(),
  retiredDate?: number | null
): number {
  const frozenEnd = soldDate && soldDate > 0
    ? soldDate
    : retiredDate && retiredDate > 0
      ? retiredDate
      : now
  const end = frozenEnd
  return Math.max(1, Math.floor((end - purchaseDate) / DAY_MS))
}

export function calcProfit(
  status: string | undefined,
  price: number,
  soldPrice?: number | null
): number | undefined {
  if (status !== 'sold') return undefined
  if (soldPrice === null || soldPrice === undefined) return undefined
  return soldPrice - price
}

/** 统一服务端 / 本地端的派生字段口径。 */
export function calcAssetFields(
  asset: AssetCalcInput,
  now: number = Date.now()
): AssetDerivedFields {
  const price = toNumber(asset.price) ?? 0
  const purchaseDate = toTimestamp(asset.purchaseDate) ?? now
  const soldDate = asset.status === 'sold' ? toTimestamp(asset.soldDate) : undefined
  const retiredDate = asset.status === 'retired' ? toTimestamp(asset.retiredDate) : undefined
  const soldPrice = toNumber(asset.soldPrice)
  const usageCount = toNumber(asset.usageCount) ?? 0
  const calcType = asset.calcType || 'count'

  const daysHeld = resolveDaysHeld(purchaseDate, soldDate, now, retiredDate)
  const costPerUse = calcType === 'count' ? (usageCount > 0 ? price / usageCount : price) : 0
  const costPerDay = calcType === 'day' ? price / daysHeld : 0
  const profit = calcProfit(asset.status, price, soldPrice)

  return { daysHeld, costPerUse, costPerDay, ...(profit !== undefined ? { profit } : {}) }
}

/**
 * 汇总口径：总资产估值与日均成本只统计未卖出资产，
 * 已实现盈亏只累计有卖出价格的已卖出资产。
 */
export function calcAssetStats(
  assets: AssetCalcInput[],
  now: number = Date.now()
): AssetStats {
  let totalValue = 0
  let dailyCost = 0
  let realizedProfit = 0

  for (const asset of assets) {
    const price = toNumber(asset.price) ?? 0

    if (asset.status === 'sold') {
      const profit = calcProfit(asset.status, price, toNumber(asset.soldPrice))
      if (profit !== undefined) realizedProfit += profit
      continue
    }

    totalValue += price

    const purchaseDate = toTimestamp(asset.purchaseDate)
    if (purchaseDate !== undefined) {
      const retiredDate = asset.status === 'retired' ? toTimestamp(asset.retiredDate) : undefined
      const daysHeld = resolveDaysHeld(purchaseDate, undefined, now, retiredDate)
      if (daysHeld > 0) dailyCost += price / daysHeld
    }
  }

  return {
    totalValue: round2(totalValue),
    dailyCost: round2(dailyCost),
    realizedProfit: round2(realizedProfit),
  }
}
