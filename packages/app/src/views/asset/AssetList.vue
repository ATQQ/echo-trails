<template>
  <div class="asset-list">
    <van-nav-bar title="我的资产" left-arrow @click-left="onClickLeft" fixed placeholder>
      <template #right>
        <van-icon name="plus" size="18" @click="handleAdd" />
      </template>
    </van-nav-bar>

    <!-- Header Stats -->
    <div class="stats-header">
      <div class="overview-card">
        <div class="total-value">
          <div class="label">总资产估值</div>
          <div class="value">{{ formatCurrency(totalValue) }}</div>
        </div>
        <div class="divider"></div>
        <div class="daily-cost">
          <div class="label">日均持有成本</div>
          <div class="value">{{ formatCurrency(dailyCost) }}</div>
        </div>
      </div>

      <div class="status-bar-container">
        <div class="status-text">
          <div class="status-item"><span class="dot active"></span>服役中 {{ activeCount }}</div>
          <div class="status-item"><span class="dot retired"></span>已退役 {{ retiredCount }}</div>
          <div class="status-item"><span class="dot sold"></span>已卖出 {{ soldCount }}</div>
        </div>
        <div class="progress-bar">
          <div class="bar-segment active" :style="{ width: activePercentage + '%' }"></div>
          <div class="bar-segment remainder" :style="{ width: (100 - activePercentage) + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- Category Tabs -->
    <van-tabs v-model:active="activeCategory" sticky offset-top="46px">
      <van-tab title="全部" name="all">
        <!-- Filter Area -->
        <div class="filter-area">
          <van-dropdown-menu class="status-dropdown">
            <van-dropdown-item v-model="activeStatusFilter" :options="statusOptionsWithAll" />
          </van-dropdown-menu>

          <div class="filter-chips">
            <span class="chip-placeholder" v-if="activeCategory === 'all'">选择分类查看子类</span>
          </div>
        </div>

        <div class="list-container">
          <AssetItem v-for="item in filteredAssets" :key="item.id" :item="item" @increment="incrementUsage"
            @edit="handleEdit" @delete="handleDelete" @click-body="handleBodyClick" />
          <van-empty v-if="filteredAssets.length === 0" description="暂无数据" />
        </div>
      </van-tab>

      <van-tab v-for="cat in store.categories" :key="cat.id" :title="cat.name" :name="cat.id">
        <!-- Filter Area for Specific Category -->
        <div class="filter-area">
          <van-dropdown-menu class="status-dropdown">
            <van-dropdown-item v-model="activeStatusFilter" :options="statusOptionsWithAll" />
          </van-dropdown-menu>

          <div class="filter-chips">
            <van-tag plain round size="medium" :type="activeSubCategory === 'all' ? 'primary' : 'default'"
              @click="activeSubCategory = 'all'" class="filter-chip">
              全部
            </van-tag>
            <van-tag v-for="sub in cat.subCategories" :key="sub.id" plain round size="medium"
              :type="activeSubCategory === sub.id ? 'primary' : 'default'" @click="activeSubCategory = sub.id"
              class="filter-chip">
              {{ sub.name }}
            </van-tag>
          </div>
        </div>

        <div class="list-container">
          <AssetItem v-for="item in filteredAssets" :key="item.id" :item="item" @increment="incrementUsage"
            @edit="handleEdit" @delete="handleDelete" @click-body="handleBodyClick" />
          <van-empty v-if="filteredAssets.length === 0" description="暂无数据" />
        </div>
      </van-tab>
    </van-tabs>

    <!-- Add/Edit Asset Form -->
    <AssetForm v-model:visible="showAssetForm" :categories="store.categories" :statuses="store.statuses"
      :initial-data="editingAsset" @save="onSave" />

    <!-- Increment Confirmation Dialog -->
    <van-dialog v-model:show="showIncrementDialog" title="增加使用次数" show-cancel-button @confirm="confirmIncrement">
      <van-field v-model="incrementDescription" label="备注" placeholder="请输入使用备注（选填）" type="textarea" rows="2"
        autosize />
    </van-dialog>

    <!-- Usage History Popup -->
    <van-popup v-model:show="showHistoryPopup" position="bottom" :style="{ height: '60%' }" closeable round>
      <div class="popup-title">使用记录</div>
      <div class="history-list">
        <van-loading v-if="historyLoading" vertical class="loading-spinner">加载中...</van-loading>
        <template v-else>
          <van-cell-group v-if="usageHistory.length > 0">
            <van-cell v-for="record in usageHistory" :key="record._id" :title="formatDate(record.createdAt)"
              :label="record.description || '无备注'" />
          </van-cell-group>
          <van-empty v-else description="暂无记录" />
        </template>
      </div>
    </van-popup>

    <AddButton class="add-position" @click="handleAdd" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAssetStore, type Asset } from '@/stores/asset';
import { storeToRefs } from 'pinia';
import { preventBack } from '@/lib/router';
import { showConfirmDialog, showToast } from 'vant';
import { addUsageRecord, getUsageRecords } from '@/service';
import AddButton from '@/components/AddButton/AddButton.vue';
import AssetItem from '@/components/AssetItem/AssetItem.vue';
import AssetForm from '@/components/AssetForm/AssetForm.vue';
import { formatCurrency } from '@/lib/format';
import { useAssetStats } from '@/hooks/useAssetStats';

const router = useRouter();
const store = useAssetStore();
const { assets, categories } = storeToRefs(store);
const { totalValue, dailyCost, refreshStats } = useAssetStats(store);

onMounted(() => {
  store.loadData().then(() => {
    refreshStats();
  });
});

const activeCategory = ref('all');
const activeStatusFilter = ref('active');
const activeSubCategory = ref('all');

// Reset subcategory when main category changes
watch(activeCategory, () => {
  activeSubCategory.value = 'all';
});

const activeCount = computed(() => assets.value.filter(a => a.status === 'active').length);
const retiredCount = computed(() => assets.value.filter(a => a.status === 'retired').length);
const soldCount = computed(() => assets.value.filter(a => a.status === 'sold').length);
const activePercentage = computed(() => {
  const total = assets.value.length;
  return total > 0 ? (activeCount.value / total) * 100 : 0;
});

const filteredAssets = computed(() => {
  return assets.value.filter(item => {
    // Category Filter
    let catMatch = true;
    if (activeCategory.value !== 'all') {
      // Match by ID
      catMatch = item.categoryId === activeCategory.value;
    }

    // Status Filter
    let statusMatch = true;
    if (activeStatusFilter.value !== 'all') {
      statusMatch = item.status === activeStatusFilter.value;
    }

    // SubCategory Filter
    let subCatMatch = true;
    if (activeCategory.value !== 'all' && activeSubCategory.value !== 'all') {
      subCatMatch = item.subCategoryId === activeSubCategory.value;
    }

    return catMatch && statusMatch && subCatMatch;
  }).map(item => {
    // Enrich item with subcategory name for display
    const cat = categories.value.find(c => c.id === item.categoryId);
    const sub = cat?.subCategories.find(s => s.id === item.subCategoryId);
    return {
      ...item,
      subCategoryName: sub?.name
    };
  });
});

const statusOptionsWithAll = computed(() => [
  { text: '全部状态', value: 'all' },
  ...store.statuses.map(s => ({ text: s.name, value: s.value }))
]);

const onClickLeft = () => {
  router.back();
};

// --- Increment Usage with Confirmation & Record ---
const showIncrementDialog = ref(false);
const incrementDescription = ref('');
const currentIncrementId = ref('');

const incrementUsage = (id: string) => {
  currentIncrementId.value = id;
  incrementDescription.value = '';
  showIncrementDialog.value = true;
};

const confirmIncrement = async () => {
  if (!currentIncrementId.value) return;

  try {
    // 1. Add Record
    await addUsageRecord({
      targetId: currentIncrementId.value,
      targetType: 'asset',
      actionType: 'increment_usage',
      description: incrementDescription.value
    });

    // 2. Update Asset
    const asset = assets.value.find(a => a.id === currentIncrementId.value);
    if (asset) {
      await store.updateAsset(currentIncrementId.value, { usageCount: asset.usageCount + 1 });
      await store.loadData();
      refreshStats();
    }

    showToast('记录成功');
    showIncrementDialog.value = false;
  } catch (e) {
    console.error(e);
    showToast('操作失败');
  }
};

// --- Usage History Popup ---
const showHistoryPopup = ref(false);
const usageHistory = ref<any[]>([]);
const historyLoading = ref(false);

const handleBodyClick = async (item: Asset) => {
  if(item.calcType !== 'count') return;
  // Only show history for 'count' type assets? Or all?
  // User said "Item can be clicked to view added times record"
  // Assuming mostly relevant for 'count' type, but maybe generic history later.
  // Let's show it for all for now, as records are generic.

  usageHistory.value = [];
  showHistoryPopup.value = true;
  historyLoading.value = true;

  try {
    const records = await getUsageRecords(item.id, { targetType: 'asset', actionType: 'increment_usage' });
    usageHistory.value = records;
  } catch (e) {
    console.error(e);
  } finally {
    historyLoading.value = false;
  }
};

const formatDate = (ts: string) => {
  return new Date(ts).toLocaleString();
}


// --- Form Logic ---
const showAssetForm = ref(false);
const editingAsset = ref<Asset | null>(null);
preventBack(showAssetForm);
preventBack(showHistoryPopup);

const handleAdd = () => {
  editingAsset.value = null;
  showAssetForm.value = true;
};

const handleEdit = (item: Asset) => {
  editingAsset.value = item;
  showAssetForm.value = true;
};

const handleDelete = (id: string) => {
  showConfirmDialog({
    title: '确认删除',
    message: '删除后无法恢复，确认删除吗？'
  }).then(async () => {
    await store.deleteAsset(id);
    refreshStats();
    showToast('删除成功');
  }).catch(() => {
    // cancel
  });
}

const onSave = () => {
  store.loadData().then(() => {
    refreshStats();
  });
};

</script>

<style scoped lang="scss">
.van-nav-bar__placeholder> :deep(.van-nav-bar--fixed) {
  padding-top: var(--safe-area-top);
}

.asset-list {
  background-color: #f7f8fa;
  min-height: 100vh;
  box-sizing: border-box;
  padding-bottom: var(--footer-area-height);
}

.stats-header {
  background-color: #f7f8fa;
  padding: 16px;

  .overview-card {
    background: linear-gradient(135deg, #1989fa, #39b9f8);
    border-radius: 12px;
    padding: 20px;
    color: #fff;
    display: flex;
    justify-content: space-between;
    margin-bottom: 16px;
    box-shadow: 0 4px 12px rgba(25, 137, 250, 0.3);

    .total-value,
    .daily-cost {
      flex: 1;
    }

    .label {
      font-size: 13px;
      opacity: 0.9;
      margin-bottom: 8px;
    }

    .value {
      font-size: 20px;
      font-weight: bold;
    }
  }

  .status-bar-container {
    background: #fff;
    padding: 12px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);

    .status-text {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 8px;
      color: #646566;
    }
  }
}

.filter-area {
  display: flex;
  align-items: center;
  background-color: #fff;
  border-bottom: 1px solid #f2f2f2;

  .status-dropdown {
    flex: 0 0 100px; // Fixed width for status

    :deep(.van-dropdown-menu__bar) {
      box-shadow: none;
      height: 44px;
    }

    :deep(.van-dropdown-menu__title) {
      font-size: 13px;
    }
  }

  .filter-chips {
    flex: 1;
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 0 12px;
    align-items: center;
    height: 44px;
    white-space: nowrap;

    .filter-chip {
      padding: 4px 12px;
    }

    .chip-placeholder {
      color: #999;
      font-size: 12px;
    }
  }
}


.list-container {
  padding: 10px 16px;
}

.popup-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f7f8fa;

  .form-scroll {
    flex: 1;
    overflow-y: auto;
    padding-top: 10px;
  }
}

.popup-title {
  text-align: center;
  font-size: 16px;
  font-weight: bold;
  padding: 16px;
  border-bottom: 1px solid #eee;
}

.history-list {
  padding: 10px;
  overflow-y: auto;
  max-height: calc(100% - 50px);
}

.loading-spinner {
  margin-top: 40px;
}

.add-position {
  bottom: var(--footer-area-height);
}
</style>
