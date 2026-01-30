<template>
  <div class="asset-list">
    <van-nav-bar title="我的资产" left-arrow @click-left="onClickLeft" fixed placeholder>
      <template #right>
        <van-icon name="plus" size="18" @click="showAddPopup = true" />
      </template>
    </van-nav-bar>

    <!-- Header Stats -->
    <div class="stats-header">
      <div class="stat-row">
        <div class="stat-item">
          <div class="label">总资产</div>
          <div class="value">¥{{ totalValue.toFixed(2) }}</div>
        </div>
        <div class="stat-item">
          <div class="label">日均成本</div>
          <div class="value">¥{{ dailyCost.toFixed(2) }}</div>
        </div>
      </div>
      <div class="status-bar">
        <div class="status-text">
          <span>服役中 {{ activeCount }}</span>
          <span>已退役 {{ retiredCount }}</span>
          <span>已卖出 {{ soldCount }}</span>
        </div>
        <van-progress
          :percentage="activePercentage"
          stroke-width="8"
          :show-pivot="false"
          track-color="#ebedf0"
          color="#07c160"
        />
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
             <!-- All Subcategories is implicitly selected if no chip active?
                  Or do we show subcategories for ALL items?
                  Usually subcategories depend on Main Category.
                  If "All" Main Category is selected, maybe we don't show subcategories,
                  or show ALL subcategories?
                  Let's assume "All" tab doesn't have subcategory filter, or just flat list.
                  But the user requirement implies subcategory filter.
                  Let's show no subcategory chips for "All" tab for now, or just show status.
             -->
             <span class="chip-placeholder" v-if="activeCategory === 'all'">选择分类查看子类</span>
          </div>
        </div>

        <div class="list-container">
           <AssetItems :assets="filteredAssets" @increment="incrementUsage" />
        </div>
      </van-tab>

      <van-tab v-for="cat in store.categories" :key="cat.id" :title="cat.name" :name="cat.id">
         <!-- Filter Area for Specific Category -->
         <div class="filter-area">
          <van-dropdown-menu class="status-dropdown">
             <van-dropdown-item v-model="activeStatusFilter" :options="statusOptionsWithAll" />
          </van-dropdown-menu>

          <div class="filter-chips">
             <van-tag
                plain
                round
                size="medium"
                :type="activeSubCategory === 'all' ? 'primary' : 'default'"
                @click="activeSubCategory = 'all'"
                class="filter-chip"
              >
                全部
              </van-tag>
             <van-tag
                v-for="sub in cat.subCategories"
                :key="sub.id"
                plain
                round
                size="medium"
                :type="activeSubCategory === sub.id ? 'primary' : 'default'"
                @click="activeSubCategory = sub.id"
                class="filter-chip"
              >
                {{ sub.name }}
              </van-tag>
          </div>
        </div>

         <div class="list-container">
            <AssetItems :assets="filteredAssets" @increment="incrementUsage" />
         </div>
      </van-tab>
    </van-tabs>

    <!-- Add Asset Popup -->
    <van-popup v-model:show="showAddPopup" position="bottom" :style="{ height: '100%' }" class="safe-padding-top">
      <div class="popup-content">
        <van-nav-bar title="添加资产" right-text="保存" left-arrow @click-left="showAddPopup = false" @click-right="handleSave" />
        <div class="form-scroll">
          <van-form>
            <van-cell-group inset title="基本信息">
              <van-field name="uploader" label="图片">
                <template #input>
                  <van-uploader v-model="fileList" :max-count="1" :after-read="afterRead" />
                </template>
              </van-field>

              <van-field v-model="newItem.name" label="物品名" placeholder="请输入物品名称" required />

              <van-field
                v-model="newItem.categoryName"
                is-link
                readonly
                label="分类"
                placeholder="选择分类"
                @click="showCategoryPicker = true"
                required
              />
              <van-popup v-model:show="showCategoryPicker" position="bottom">
                <van-picker
                  :columns="categoryColumns"
                  @confirm="onConfirmCategory"
                  @cancel="showCategoryPicker = false"
                />
              </van-popup>

              <van-field
                v-if="currentSubCategories.length > 0"
                v-model="newItem.subCategoryName"
                is-link
                readonly
                label="子分类"
                placeholder="选择子分类"
                @click="showSubCategoryPicker = true"
              />
              <van-popup v-model:show="showSubCategoryPicker" position="bottom">
                <van-picker
                  :columns="subCategoryColumns"
                  @confirm="onConfirmSubCategory"
                  @cancel="showSubCategoryPicker = false"
                />
              </van-popup>

              <van-field
                v-model="newItem.statusName"
                is-link
                readonly
                label="状态"
                placeholder="选择状态"
                @click="showStatusPicker = true"
                required
              />
              <van-popup v-model:show="showStatusPicker" position="bottom">
                <van-picker
                  :columns="statusColumns"
                  @confirm="onConfirmStatus"
                  @cancel="showStatusPicker = false"
                />
              </van-popup>

              <van-field v-model="newItem.price" type="number" label="金额" placeholder="0.00" required />

              <van-field
                v-model="newItem.dateStr"
                is-link
                readonly
                label="购入时间"
                placeholder="点击选择日期"
                @click="showCalendar = true"
                required
              />
              <van-calendar v-model:show="showCalendar" @confirm="onConfirmDate" />

              <van-field label="计费方式" readonly>
                <template #input>
                  <van-radio-group v-model="newItem.calcType" direction="horizontal">
                    <van-radio name="count">按次</van-radio>
                    <van-radio name="day">按天</van-radio>
                    <van-radio name="consumable">消耗品</van-radio>
                  </van-radio-group>
                </template>
              </van-field>

              <van-field v-model="newItem.description" label="描述" type="textarea" placeholder="备注信息" rows="3" autosize />
            </van-cell-group>
          </van-form>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, defineComponent } from 'vue';
import { useRouter } from 'vue-router';
import { useAssetStore, type Asset } from '@/stores/asset';
import { storeToRefs } from 'pinia';
import { showToast } from 'vant';
import { preventBack } from '@/lib/router';

// Component for rendering list items to avoid duplication
const AssetItems = defineComponent({
  props: ['assets'],
  emits: ['increment'],
  template: `
    <div>
      <div v-for="item in assets" :key="item.id" class="asset-item">
        <div class="item-image">
            <van-image
            width="60"
            height="60"
            radius="8"
            :src="item.image || 'https://fastly.jsdelivr.net/npm/@vant/assets/cat.jpeg'"
            fit="cover"
          />
        </div>
        <div class="item-info">
          <div class="item-header">
             <div class="item-name">{{ item.name }}</div>
             <van-tag plain type="primary" v-if="item.subCategoryName">{{ item.subCategoryName }}</van-tag>
          </div>
          <div class="cost-per-use">
             <template v-if="item.calcType === 'count'">
               ¥{{ (item.usageCount > 0 ? item.price / item.usageCount : item.price).toFixed(2) }}/{{ item.usageCount > 0 ? '次' : '未用' }}
             </template>
             <template v-else-if="item.calcType === 'day'">
               ¥{{ ((Date.now() - item.purchaseDate) > 0 ? item.price / Math.max(1, Math.floor((Date.now() - item.purchaseDate)/(1000*60*60*24))) : item.price).toFixed(2) }}/天
             </template>
             <template v-else>
               消耗品
             </template>
          </div>
          <div class="details">
            <span>¥{{ item.price }}</span>
            <span class="separator">•</span>
            <span>已用 {{ item.usageCount }} 次</span>
          </div>
        </div>
        <div class="item-action">
          <van-button icon="plus" round type="success" size="small" @click.stop="$emit('increment', item.id)" />
        </div>
      </div>
      <van-empty v-if="assets.length === 0" description="暂无数据" />
    </div>
  `
});

const router = useRouter();
const store = useAssetStore();
const { assets, categories, statuses, totalValue, dailyCost } = storeToRefs(store);

const activeCategory = ref('all');
const activeStatusFilter = ref('active'); // Default to 'active' or 'all'? Let's default to 'active' as per screenshot usually showing active items.
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

const statusColumns = computed(() => store.statuses.map(s => ({ text: s.name, value: s.value })));

const onClickLeft = () => {
  router.push('/discovery');
};

const incrementUsage = (id: string) => {
  const asset = assets.value.find(a => a.id === id);
  if (asset) {
    store.updateAsset(id, { usageCount: asset.usageCount + 1 });
  }
};

// --- Form Logic ---
const showAddPopup = ref(false);
preventBack(showAddPopup);
const fileList = ref<any[]>([]);

const newItem = reactive({
  name: '',
  categoryName: '',
  categoryId: '',
  subCategoryName: '',
  subCategoryId: '',
  statusName: '服役中',
  statusValue: 'active',
  price: '',
  dateStr: '',
  purchaseDate: 0,
  calcType: 'count',
  description: '',
  image: ''
});

const showCategoryPicker = ref(false);
const showSubCategoryPicker = ref(false);
const showStatusPicker = ref(false);
const showCalendar = ref(false);

const categoryColumns = computed(() => store.categories.map(c => ({ text: c.name, value: c.id })));

const currentSubCategories = computed(() => {
  if (!newItem.categoryId) return [];
  const cat = store.categories.find(c => c.id === newItem.categoryId);
  return cat ? cat.subCategories : [];
});

const subCategoryColumns = computed(() => currentSubCategories.value.map(s => ({ text: s.name, value: s.id })));

const onConfirmCategory = ({ selectedOptions }: any) => {
  newItem.categoryName = selectedOptions[0].text;
  newItem.categoryId = selectedOptions[0].value;
  newItem.subCategoryName = ''; // Reset subcategory
  newItem.subCategoryId = '';
  showCategoryPicker.value = false;
};

const onConfirmSubCategory = ({ selectedOptions }: any) => {
  newItem.subCategoryName = selectedOptions[0].text;
  newItem.subCategoryId = selectedOptions[0].value;
  showSubCategoryPicker.value = false;
};

const onConfirmStatus = ({ selectedOptions }: any) => {
  newItem.statusName = selectedOptions[0].text;
  newItem.statusValue = selectedOptions[0].value;
  showStatusPicker.value = false;
};

const onConfirmDate = (date: Date) => {
  newItem.dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  newItem.purchaseDate = date.getTime();
  showCalendar.value = false;
};

const afterRead = (file: any) => {
  // Use ObjectURL for preview since we are UI only
  newItem.image = file.objectUrl || URL.createObjectURL(file.file);
};

const handleSave = () => {
  if (!newItem.name || !newItem.categoryId || !newItem.price || !newItem.purchaseDate) {
    showToast('请填写必填项');
    return;
  }

  store.addAsset({
    name: newItem.name,
    category: newItem.categoryName, // Keeping name for backward compat if needed, but ID is primary now
    categoryId: newItem.categoryId,
    subCategoryId: newItem.subCategoryId,
    status: newItem.statusValue as any,
    price: Number(newItem.price),
    purchaseDate: newItem.purchaseDate,
    usageCount: 0,
    description: newItem.description,
    image: newItem.image,
    calcType: newItem.calcType as any
  });

  showToast('添加成功');
  showAddPopup.value = false;
  // Reset form
  newItem.name = '';
  newItem.categoryName = '';
  newItem.categoryId = '';
  newItem.subCategoryName = '';
  newItem.subCategoryId = '';
  newItem.statusName = '服役中';
  newItem.statusValue = 'active';
  newItem.price = '';
  newItem.dateStr = '';
  newItem.description = '';
  newItem.image = '';
  fileList.value = [];
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
}

.stats-header {
  background-color: #2c2c2c;
  color: #fff;
  padding: 20px 16px;

  .stat-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 20px;

    .stat-item {
      .label {
        font-size: 12px;
        opacity: 0.7;
        margin-bottom: 4px;
      }
      .value {
        font-size: 24px;
        font-weight: bold;
      }
    }
  }

  .status-bar {
    .status-text {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 6px;
      opacity: 0.8;
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

.asset-item {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);

  .item-image {
    margin-right: 12px;
    flex-shrink: 0;
  }

  .item-info {
    flex: 1;

    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;

      .item-name {
         font-weight: bold;
         color: #323233;
      }
    }

    .cost-per-use {
      font-size: 16px;
      font-weight: 600;
      color: #323233;
      margin-bottom: 4px;
    }

    .details {
      font-size: 12px;
      color: #969799;

      .separator {
        margin: 0 4px;
      }
    }
  }

  .item-action {
    margin-left: 8px;
  }
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
</style>
