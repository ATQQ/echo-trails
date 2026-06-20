<template>
  <div v-if="albumHomeMemorials.length" class="memorial-album-section">
    <div class="section-header" @click="goToMemorialList">
      <h2>纪念日</h2>
      <van-icon name="arrow" />
    </div>
    <div class="horizontal-scroll">
      <div
        v-for="item in albumHomeMemorials"
        :key="item.id"
        class="memorial-card"
        @click="openDetail(item)"
      >
        <div class="memorial-bg" :style="getBgStyle(item)"></div>
        <div class="memorial-content">
          <div class="memorial-title">{{ item.displayTitle || item.name }}</div>
          <div class="memorial-days">
            <span class="label">{{ getLabel(item) }}</span>
            <span class="number">{{ getDays(item) }}</span>
            <span class="unit">天</span>
          </div>
          <div class="memorial-date">{{ formatDate(item.date) }}</div>
          <van-progress
            v-if="item.endDate"
            class="memorial-progress"
            :percentage="getProgress(item)"
            :stroke-width="4"
            :show-pivot="false"
            color="#fff"
            track-color="rgba(255,255,255,0.3)"
          />
        </div>
      </div>
    </div>

    <van-popup
      v-model:show="showDetail"
      position="right"
      :style="{ width: '100%', height: '100%' }"
      class="detail-popup"
    >
      <MemorialDetail
        v-if="selectedItem"
        :item="selectedItem"
        @close="showDetail = false"
        @edit="handleEdit"
        @update="handleDetailUpdate"
      />
    </van-popup>

    <van-popup
      v-model:show="showEditForm"
      position="bottom"
      round
      :style="{ height: '100%' }"
      class="safe-padding-top"
    >
      <MemorialForm
        v-if="showEditForm && editingItem"
        :initial-data="editingItem"
        @close="showEditForm = false"
        @save="handleUpdate"
        @delete="handleDelete"
      />
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useMemorialStore, type MemorialDay } from '@/stores/memorial';
import { useMemorialCalc } from '@/composables/useMemorialCalc';
import MemorialDetail from '@/views/memorial/MemorialDetail.vue';
import MemorialForm from '@/components/MemorialForm/MemorialForm.vue';
import { preventBack } from '@/lib/router';

const router = useRouter();
const store = useMemorialStore();
const { albumHomeMemorials } = storeToRefs(store);
const { getDays, getLabel, getProgress, formatDate } = useMemorialCalc();

const showDetail = ref(false);
const showEditForm = ref(false);
const selectedItem = ref<MemorialDay | null>(null);
const editingItem = ref<MemorialDay | null>(null);

preventBack(showDetail);
preventBack(showEditForm);

const getBgStyle = (item: MemorialDay) => {
  if (item.coverImage) {
    return {
      backgroundImage: `url(${item.coverImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return {
    background: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)',
  };
};

const goToMemorialList = () => {
  router.push('/memorial');
};

const openDetail = (item: MemorialDay) => {
  selectedItem.value = item;
  showDetail.value = true;
};

const handleEdit = (item: MemorialDay) => {
  editingItem.value = item;
  showEditForm.value = true;
};

const handleUpdate = async (data: Partial<MemorialDay>) => {
  if (!editingItem.value) return;

  await store.updateMemorial(editingItem.value.id, data);
  showEditForm.value = false;

  if (selectedItem.value && selectedItem.value.id === editingItem.value.id) {
    const updated = store.memorials.find(m => m.id === editingItem.value!.id);
    if (updated) {
      selectedItem.value = updated;
    }
  }
};

const handleDetailUpdate = (updatedItem: MemorialDay) => {
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
.memorial-album-section {
  margin-bottom: 8px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  margin-bottom: 12px;

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
}

.horizontal-scroll {
  display: flex;
  overflow-x: auto;
  gap: 12px;
  padding: 0 16px;
  scroll-padding-left: 16px;
  scroll-padding-right: 16px;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
}

.memorial-card {
  position: relative;
  flex-shrink: 0;
  scroll-snap-align: start;
  width: 38vw;
  min-width: 132px;
  height: 108px;
  border-radius: 12px;
  overflow: hidden;
  color: #fff;
}

.memorial-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  filter: brightness(0.9);
}

.memorial-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: 100%;
  padding: 10px 12px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.45));
}

.memorial-title {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.memorial-days {
  margin-bottom: 2px;

  .label {
    font-size: 11px;
    margin-right: 2px;
  }

  .number {
    font-size: 20px;
    font-weight: bold;
  }

  .unit {
    font-size: 11px;
    margin-left: 2px;
  }
}

.memorial-date {
  font-size: 10px;
  opacity: 0.9;
}

.memorial-progress {
  margin-top: 6px;
}
</style>
