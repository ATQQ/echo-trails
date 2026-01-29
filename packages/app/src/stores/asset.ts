import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface Asset {
  id: string;
  name: string;
  category: string; // This stores the Category ID or Name? Currently Name based on mock. Ideally ID.
  categoryId: string;
  subCategoryId?: string;
  status: 'active' | 'retired' | 'sold';
  price: number;
  purchaseDate: number; // timestamp
  usageCount: number;
  image?: string;
  description?: string;
  createTime: number;
  calcType: 'count' | 'day' | 'consumable'; // Added 'consumable'
}

export interface SubCategory {
  id: string;
  name: string;
}

export interface AssetCategory {
  id: string;
  name: string;
  subCategories: SubCategory[];
}

export interface AssetStatus {
  id: string;
  name: string;
  value: 'active' | 'retired' | 'sold';
}

export const useAssetStore = defineStore('asset', () => {
  // --- State ---
  const assets = ref<Asset[]>([
    {
      id: '1',
      name: 'MacBook Pro',
      category: '数码',
      categoryId: '1',
      subCategoryId: '1-1',
      status: 'active',
      price: 12999,
      purchaseDate: Date.now() - 1000 * 60 * 60 * 24 * 30,
      usageCount: 30,
      createTime: Date.now() - 1000 * 60 * 60 * 24 * 30,
      calcType: 'day'
    },
    {
      id: '2',
      name: 'iPhone 15',
      category: '数码',
      categoryId: '1',
      subCategoryId: '1-2',
      status: 'active',
      price: 6999,
      purchaseDate: Date.now() - 1000 * 60 * 60 * 24 * 10,
      usageCount: 100,
      createTime: Date.now() - 1000 * 60 * 60 * 24 * 10,
      calcType: 'day'
    },
    {
      id: '3',
      name: 'Winter Coat',
      category: '衣物',
      categoryId: '2',
      subCategoryId: '2-1',
      status: 'retired',
      price: 1200,
      purchaseDate: Date.now() - 1000 * 60 * 60 * 24 * 365,
      usageCount: 50,
      createTime: Date.now() - 1000 * 60 * 60 * 24 * 365,
      calcType: 'count'
    }
  ]);

  const categories = ref<AssetCategory[]>([
    {
      id: '1',
      name: '数码',
      subCategories: [
        { id: '1-1', name: '电脑' },
        { id: '1-2', name: '手机' },
        { id: '1-3', name: '配件' }
      ]
    },
    {
      id: '2',
      name: '衣物',
      subCategories: [
        { id: '2-1', name: '上衣' },
        { id: '2-2', name: '裤子' },
        { id: '2-3', name: '鞋靴' },
        { id: '2-4', name: '配饰' }
      ]
    },
    {
      id: '3',
      name: '家电',
      subCategories: []
    },
    {
      id: '4',
      name: '书籍',
      subCategories: []
    },
    {
      id: '5',
      name: '其他',
      subCategories: []
    },
  ]);

  const statuses = ref<AssetStatus[]>([
    { id: '1', name: '服役中', value: 'active' },
    { id: '2', name: '已退役', value: 'retired' },
    { id: '3', name: '已卖出', value: 'sold' },
  ]);

  // --- Getters ---
  const totalValue = computed(() => {
    return assets.value.reduce((sum, item) => sum + item.price, 0);
  });

  const dailyCost = computed(() => {
    const now = Date.now();
    let totalDays = 0;
    let totalP = 0;

    assets.value.forEach(item => {
      const days = Math.max(1, Math.floor((now - item.purchaseDate) / (1000 * 60 * 60 * 24)));
      totalDays += days;
      totalP += item.price;
    });

    return totalDays > 0 ? (totalP / totalDays) : 0;
  });

  const assetsByDate = computed(() => {
    return [...assets.value].sort((a, b) => b.purchaseDate - a.purchaseDate);
  });

  // --- Actions ---
  const addAsset = (asset: Omit<Asset, 'id' | 'createTime'>) => {
    const newAsset: Asset = {
      ...asset,
      id: Date.now().toString(),
      createTime: Date.now(),
    };
    assets.value.push(newAsset);
  };

  const updateAsset = (id: string, updates: Partial<Asset>) => {
    const index = assets.value.findIndex(a => a.id === id);
    if (index !== -1) {
      assets.value[index] = { ...assets.value[index], ...updates };
    }
  };

  const deleteAsset = (id: string) => {
    const index = assets.value.findIndex(a => a.id === id);
    if (index !== -1) {
      assets.value.splice(index, 1);
    }
  };

  const addCategory = (name: string) => {
    categories.value.push({ id: Date.now().toString(), name, subCategories: [] });
  };

  const removeCategory = (id: string) => {
    const index = categories.value.findIndex(c => c.id === id);
    if (index !== -1) categories.value.splice(index, 1);
  };

  const addSubCategory = (categoryId: string, name: string) => {
    const cat = categories.value.find(c => c.id === categoryId);
    if (cat) {
      cat.subCategories.push({ id: Date.now().toString(), name });
    }
  };

  const removeSubCategory = (categoryId: string, subCategoryId: string) => {
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
    totalValue,
    dailyCost,
    assetsByDate,
    addAsset,
    updateAsset,
    deleteAsset,
    addCategory,
    removeCategory,
    addSubCategory,
    removeSubCategory
  };
});
