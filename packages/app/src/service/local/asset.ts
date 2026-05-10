import { invoke } from '@tauri-apps/api/core'

const DEFAULT_CATEGORIES = [
  { name: '数码', subs: ['手机', '电脑', '平板', '相机', '配件'] },
  { name: '衣物', subs: ['上衣', '裤子', '鞋靴', '包袋', '配饰'] },
  { name: '家电', subs: ['大家电', '厨房电器', '生活电器'] },
  { name: '家具', subs: ['桌椅', '储物', '床具'] },
  { name: '图书', subs: ['技术', '文学'] },
  { name: '交通', subs: ['汽车', '自行车'] },
  { name: '虚拟', subs: ['软件', '订阅'] },
]

function mapAsset(row: any): any {
  return {
    ...row,
    _id: row.id || row._id,
    id: row.id || row._id,
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
  return (result.data || []).map(mapAsset)
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
  const result = await invoke<any>('db_asset_stats')
  return result.data || { totalValue: 0, dailyCost: 0 }
}
