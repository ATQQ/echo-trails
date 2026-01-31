<template>
  <div class="memorial-list page-container">
    <van-nav-bar title="纪念日" left-arrow @click-left="onClickLeft" fixed placeholder>
      <template #right>
        <van-icon name="plus" size="18" @click="showAddForm = true" />
      </template>
    </van-nav-bar>

    <div class="content">
      <!-- Top Pinned Card -->
      <div v-if="topPinned" class="pinned-card" @click="openDetail(topPinned)">
        <div class="pinned-bg" :style="getBgStyle(topPinned)"></div>
        <div class="pinned-content">
          <div class="pinned-title">{{ topPinned.displayTitle || topPinned.name }}</div>
          <div class="pinned-days">
            <span class="label">{{ getLabel(topPinned) }}</span>
            <span class="number">{{ getDays(topPinned) }}</span>
            <span class="unit">天</span>
          </div>
          <div class="pinned-date">起始日期 {{ formatDate(topPinned.date) }}</div>
        </div>
      </div>

      <!-- List -->
      <div class="list-section">
        <div v-for="item in sortedList" :key="item.id" class="memorial-item" @click="openDetail(item)">
          <div class="item-left">
            <div class="item-icon">
              <van-icon :name="getIcon(item)" />
            </div>
            <div class="item-info">
              <div class="item-name">{{ item.name }}</div>
              <div class="item-date">
                {{ formatDate(item.date) }}
                <van-tag v-if="item.isLunar" plain type="primary">农历</van-tag>
              </div>
            </div>
          </div>
          <div class="item-right">
            <div v-if="item.endDate" class="progress-wrapper">
              <div class="progress-text">
                <span class="item-label">{{ getLabel(item) }}</span>
                <span class="item-days" :class="item.type">{{ getDays(item) }}</span>
                <span class="item-unit">天</span>
              </div>
              <van-progress :percentage="getProgress(item)" :stroke-width="4" :show-pivot="false" color="#f2826a"
                track-color="#f5f5f5" />
            </div>
            <div v-else>
              <span class="item-label">{{ getLabel(item) }}</span>
              <span class="item-days" :class="item.type">{{ getDays(item) }}</span>
              <span class="item-unit">天</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Form -->
    <van-popup v-model:show="showAddForm" position="bottom" round :style="{ height: '100%' }" class="safe-padding-top">
      <MemorialForm v-if="showAddForm" @close="showAddForm = false" @save="handleSave" />
    </van-popup>

    <!-- Detail Full Screen Card -->
    <van-popup v-model:show="showDetail" position="right" :style="{ width: '100%', height: '100%' }"
      class="detail-popup">
      <MemorialDetail v-if="selectedItem" :item="selectedItem" @close="showDetail = false" @edit="handleEdit" @update="handleDetailUpdate" />
    </van-popup>

    <!-- Edit Form (Reuse) -->
    <van-popup v-model:show="showEditForm" position="bottom" round :style="{ height: '100%' }" class="safe-padding-top">
      <MemorialForm v-if="showEditForm && editingItem" :initial-data="editingItem" @close="showEditForm = false"
        @save="handleUpdate" @delete="handleDelete" />
    </van-popup>
    <AddButton class="add-position" @click="showAddForm = true" />


  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useMemorialStore, type MemorialDay } from '@/stores/memorial';
import { useMemorialCalc } from '@/composables/useMemorialCalc';
import MemorialForm from '@/components/MemorialForm/MemorialForm.vue';
import MemorialDetail from '@/views/memorial/MemorialDetail.vue';
import AddButton from '@/components/AddButton/AddButton.vue';
import { preventBack } from '@/lib/router';

const router = useRouter();
const store = useMemorialStore();
const { getDays, getLabel, getProgress, formatDate } = useMemorialCalc();

const showAddForm = ref(false);
const showEditForm = ref(false);
const showDetail = ref(false);
const selectedItem = ref<MemorialDay | null>(null);
const editingItem = ref<MemorialDay | null>(null);

preventBack(showAddForm)
preventBack(showEditForm)
preventBack(showDetail)

onMounted(() => {
  store.init();
});

const topPinned = computed(() => {
  return store.pinnedMemorials.length > 0 ? store.pinnedMemorials[0] : null;
});

const sortedList = computed(() => {
  // If topPinned exists, exclude it from list?
  // Usually list contains all others.
  // The requirement says "Pinned (Top) status with special visual effect".
  // It implies pinned ones are at top. If there is one "Top" card, maybe exclude it from the list below to avoid duplication.
  // Or just show all pinned ones in a special way?
  // Let's exclude the FIRST pinned one which is shown as the big card.
  const firstPinnedId = topPinned.value?.id;
  return store.memorials
    .filter(m => m.id !== firstPinnedId)
    .sort((a, b) => {
      // Sort by days left (ascending) for countdown, or days passed (descending) for cumulative?
      // Usually sort by nearest date.
      return getDays(a) - getDays(b);
    });
});

const onClickLeft = () => {
  router.back();
};

const getBgStyle = (item: MemorialDay) => {
  if (item.coverImage) {
    return {
      backgroundImage: `url(${item.coverImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    };
  }
  return {
    background: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)'
  };
};

const getIcon = (item: MemorialDay) => {
  if (item.name.includes('生日')) return 'cake-o';
  if (item.name.includes('结婚') || item.name.includes('恋爱')) return 'like-o';
  if (item.name.includes('猫') || item.name.includes('狗')) return 'smile-o';
  return 'calendar-o';
};

const openDetail = (item: MemorialDay) => {
  selectedItem.value = item;
  showDetail.value = true;
};

const handleSave = async (data: Omit<MemorialDay, 'id' | 'createdAt'>) => {
  await store.addMemorial(data);
  showAddForm.value = false;
};

const handleEdit = (item: MemorialDay) => {
  editingItem.value = item;
  showEditForm.value = true;
};

const handleUpdate = async (data: Partial<MemorialDay>) => {
  if (editingItem.value) {
    await store.updateMemorial(editingItem.value.id, data);
    showEditForm.value = false;
    // Update selected item if it's open
    if (selectedItem.value && selectedItem.value.id === editingItem.value.id) {
        // Find the updated item from the store's reactive list
        // Note: store.updateMemorial already calls store.init() which refreshes the list
        // We just need to find the new object reference in the refreshed list
        const updated = store.memorials.find(m => m.id === editingItem.value!.id);
        if (updated) {
            selectedItem.value = updated;
        }
    }
  }
};

const handleDetailUpdate = (updatedItem: MemorialDay) => {
    // When detail component updates item (e.g. cover change), we need to sync it here
    // Since the store is already updated by the detail component, we just need to ensure
    // selectedItem points to the fresh data.
    // The store list is refreshed, so we find the item again.
    const freshItem = store.memorials.find(m => m.id === updatedItem.id);
    if (freshItem) {
        selectedItem.value = freshItem;
    }
};

const handleDelete = async (id: string) => {
  await store.deleteMemorial(id);
  showEditForm.value = false;
  showDetail.value = false;
};

</script>

<style scoped lang="scss">
.add-position {
  bottom: var(--footer-area-height);
}

.van-nav-bar__placeholder>:deep(.van-nav-bar--fixed) {
  padding-top: var(--safe-area-top);
}

.page-container {
  min-height: 100vh;
  background-color: #f7f8fa;
}

.content {
  padding: 16px;
}

.pinned-card {
  position: relative;
  height: 180px;
  border-radius: 16px;
  overflow: hidden;
  color: #fff;
  margin-bottom: 24px;
  box-shadow: 0 8px 20px rgba(255, 154, 158, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;

  .pinned-bg {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 0;
    filter: brightness(0.9);
  }

  .pinned-content {
    position: relative;
    z-index: 1;
    width: 100%;
    padding: 20px;
  }

  .pinned-avatars {
    margin-bottom: 12px;

    .avatar-group {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;

      .avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.9);
        color: #333;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #fff;
      }
    }
  }

  .pinned-title {
    font-size: 16px;
    margin-bottom: 8px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .pinned-days {
    margin-bottom: 8px;

    .label {
      font-size: 14px;
      margin-right: 4px;
    }

    .number {
      font-size: 36px;
      font-weight: bold;
      font-family: 'PingFang SC', sans-serif;
    }

    .unit {
      font-size: 14px;
      margin-left: 4px;
    }
  }

  .pinned-date {
    font-size: 12px;
    opacity: 0.9;
  }
}

.list-section {
  background: #fff;
  border-radius: 12px;
  padding: 0 16px;
}

.memorial-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid #f5f5f5;

  &:last-child {
    border-bottom: none;
  }

  .item-left {
    display: flex;
    align-items: center;

    .item-icon {
      margin-right: 12px;
      font-size: 24px;
      color: #f2826a;
    }

    .item-info {
      .item-name {
        font-size: 15px;
        color: #333;
        margin-bottom: 4px;
      }

      .item-date {
        font-size: 12px;
        color: #999;
      }
    }
  }

  .item-right {
    text-align: right;

    .item-label {
      font-size: 12px;
      color: #999;
      margin-right: 4px;
    }

    .item-days {
      font-size: 20px;
      font-weight: bold;
      color: #333;

      &.countdown {
        color: #ff4d4f;
      }
    }

    .item-unit {
      font-size: 12px;
      color: #999;
      margin-left: 2px;
    }

    .progress-wrapper {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      min-width: 100px;

      .progress-text {
        margin-bottom: 4px;
      }

      :deep(.van-progress) {
        width: 100%;
      }
    }
  }
}
</style>
