import { invoke } from '@tauri-apps/api/core'
import { buildCoverUrl, buildPreviewUrl } from './fileUrl'

const DEFAULT_CATEGORIES = [
  { name: '数码', subs: ['手机', '电脑', '平板', '相机', '配件'] },
  { name: '衣物', subs: ['上衣', '裤子', '鞋靴', '包袋', '配饰'] },
  { name: '家电', subs: ['大家电', '厨房电器', '生活电器'] },
  { name: '家具', subs: ['桌椅', '储物', '床具'] },
  { name: '图书', subs: ['技术', '文学'] },
  { name: '交通', subs: ['汽车', '自行车'] },
  { name: '虚拟', subs: ['软件', '订阅'] },
]

function normalizeTimestamp(value: any) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  const time = new Date(value || Date.now()).getTime()
  return Number.isFinite(time) ? time : Date.now()
}

function calcDaysHeld(purchaseDate: number) {
  return Math.max(1, Math.floor((Date.now() - purchaseDate) / (1000 * 60 * 60 * 24)))
}

async function mapAsset(row: any): Promise<any> {
  const purchaseDate = normalizeTimestamp(row.purchaseDate)
  const usageCount = Number(row.usageCount || 0)
  const price = Number(row.price || 0)
  const calcType = row.calcType || 'count'
  const daysHeld = calcDaysHeld(purchaseDate)
  const image = row.image || ''
  const cover = row.cover || (image ? await buildCoverUrl(image, true) : '')
  const preview = row.preview || (image ? await buildPreviewUrl(image, true) : '')

  return {
    ...row,
    _id: row.id || row._id,
    id: row.id || row._id,
    price,
    purchaseDate,
    usageCount,
    calcType,
    cover,
    preview,
    createTime: normalizeTimestamp(row.createdAt || row.updated_at || row.updatedAt),
    daysHeld,
    costPerUse: calcType === 'count' ? (usageCount > 0 ? price / usageCount : price) : 0,
    costPerDay: calcType === 'day' ? price / daysHeld : 0,
  }
}

async function listAssetCategories() {
  const result = await invoke<any>('db_asset_category_list')
  return (result.data || []).map((cat: any) => ({
    ...cat,
    _id: cat.id || cat._id,
    subCategories: (cat.subCategories || []).map((sub: any) => ({
      ...sub,
      _id: sub.id || sub._id,
    }))
  }))
}

async function seedDefaultCategories() {
  for (const category of DEFAULT_CATEGORIES) {
    const result = await invoke<any>('db_asset_category_create', {
      name: category.name,
      data: JSON.stringify({ name: category.name, isSystem: true }),
    })
    const parent = result.data
    const parentId = parent?.id || parent?._id
    if (!parentId) continue

    for (const subName of category.subs) {
      await invoke('db_asset_category_create', {
        name: subName,
        parentId,
        data: JSON.stringify({ name: subName, parentId, isSystem: true }),
      })
    }
  }
}

export async function getAssetCategories() {
  let categories = await listAssetCategories()
  if (categories.length === 0) {
    await seedDefaultCategories()
    categories = await listAssetCategories()
  }
  return categories
}

export async function createAssetCategory(data: { name: string, parentId?: string }) {
  const result = await invoke<any>('db_asset_category_create', {
    name: data.name,
    parentId: data.parentId,
    data: JSON.stringify(data),
  })
  const cat = result.data
  return { ...cat, id: cat.id || cat._id }
}

export async function deleteAssetCategory(id: string) {
  return invoke('db_asset_category_delete', { id })
}

export async function getAssets(params?: { categoryId?: string, subCategoryId?: string, status?: string }) {
  const result = await invoke<any>('db_asset_list', {
    categoryId: params?.categoryId,
    subCategoryId: params?.subCategoryId,
    status: params?.status,
  })
  return Promise.all((result.data || []).map(mapAsset))
}

export async function createAsset(data: any) {
  const result = await invoke<any>('db_asset_create', {
    data: JSON.stringify({
      ...data,
      createdAt: new Date().toISOString(),
    }),
  })
  return mapAsset(result)
}

export async function updateAsset(data: any) {
  const { id, _id, ...updates } = data
  return invoke('db_asset_update', {
    id,
    data: JSON.stringify(updates),
  })
}

export async function deleteAsset(id: string) {
  return invoke('db_asset_delete', { id })
}

export async function getAssetStats() {
  const assets = await getAssets()
  const stats = assets.reduce((acc, asset) => {
    acc.totalValue += asset.price || 0
    acc.dailyCost += asset.price / calcDaysHeld(asset.purchaseDate)
    return acc
  }, { totalValue: 0, dailyCost: 0 })

  return {
    totalValue: Math.round(stats.totalValue * 100) / 100,
    dailyCost: Math.round(stats.dailyCost * 100) / 100,
  }
}
