import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  getAssets,
  createAsset,
  updateAsset as updateAssetApi,
  deleteAsset as deleteAssetApi,
  getAssetCategories,
  createAssetCategory,
  deleteAssetCategory
} from '@/service/asset';

export interface Asset {
  id: string;
  name: string;
  categoryId: string;
  subCategoryId?: string;
  status: 'active' | 'retired' | 'sold';
  price: number;
  purchaseDate: number; // timestamp
  usageCount: number;
  image?: string;
  cover?: string;
  description?: string;
  createTime: number;
  calcType: 'count' | 'day' | 'consumable';
  // Computed from backend
  costPerUse?: number;
  costPerDay?: number;
  daysHeld?: number;
}

export interface SubCategory {
  id: string;
  name: string;
  isSystem?: boolean;
}

export interface AssetCategory {
  id: string;
  name: string;
  isSystem?: boolean;
  subCategories: SubCategory[];
}

export interface AssetStatus {
  id: string;
  name: string;
  value: 'active' | 'retired' | 'sold';
}

export const useAssetStore = defineStore('asset', () => {
  // --- State ---
  const assets = ref<Asset[]>([]);
  const categories = ref<AssetCategory[]>([]);

  const statuses = ref<AssetStatus[]>([
    { id: '1', name: '服役中', value: 'active' },
    { id: '2', name: '已退役', value: 'retired' },
    { id: '3', name: '已卖出', value: 'sold' },
  ]);

  // --- Getters ---
  const assetsByDate = computed(() => {
    return [...assets.value].sort((a, b) => b.purchaseDate - a.purchaseDate);
  });

  // --- Actions ---
  const loadData = async () => {
    const [assetsData, categoriesData] = await Promise.all([
      getAssets(),
      getAssetCategories()
    ]);
    assets.value = assetsData;
    categories.value = categoriesData;
  };

  const addAsset = async (asset: Omit<Asset, 'id' | 'createTime'>) => {
    const newAsset = await createAsset(asset);
    assets.value.push({
        ...newAsset,
        id: newAsset._id,
        purchaseDate: new Date(newAsset.purchaseDate).getTime(),
        createTime: new Date(newAsset.createdAt).getTime()
    });
  };

  const updateAsset = async (id: string, updates: Partial<Asset>) => {
    await updateAssetApi({ id, ...updates });
    const index = assets.value.findIndex(a => a.id === id);
    if (index !== -1) {
      assets.value[index] = { ...assets.value[index], ...updates };
    }
  };

  const deleteAsset = async (id: string) => {
    await deleteAssetApi(id);
    const index = assets.value.findIndex(a => a.id === id);
    if (index !== -1) {
      assets.value.splice(index, 1);
    }
  };

  const addCategory = async (name: string) => {
    const newCat = await createAssetCategory({ name });
    categories.value.push({
        id: newCat.id,
        name: newCat.name,
        isSystem: false,
        subCategories: []
    });
  };

  const removeCategory = async (id: string) => {
    await deleteAssetCategory(id);
    const index = categories.value.findIndex(c => c.id === id);
    if (index !== -1) categories.value.splice(index, 1);
  };

  const addSubCategory = async (categoryId: string, name: string) => {
    const newSub = await createAssetCategory({ name, parentId: categoryId });
    const cat = categories.value.find(c => c.id === categoryId);
    if (cat) {
      cat.subCategories.push({ id: newSub.id, name: newSub.name, isSystem: false });
    }
  };

  const removeSubCategory = async (categoryId: string, subCategoryId: string) => {
    await deleteAssetCategory(subCategoryId);
    const cat = categories.value.find(c => c.id === categoryId);
    if (cat) {
      const idx = cat.subCategories.findIndex(sc => sc.id === subCategoryId);
      if (idx !== -1) cat.subCategories.splice(idx, 1);
    }
  };

  return {
    assets,
    categories,
    statuses,
    assetsByDate,
    loadData,
    addAsset,
    updateAsset,
    deleteAsset,
    addCategory,
    removeCategory,
    addSubCategory,
    removeSubCategory
  };
});
