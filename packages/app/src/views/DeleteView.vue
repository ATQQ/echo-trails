<script setup lang="ts">
import PhotoList from '@/components/PhotoList.vue';
import VideoList from '@/components/VideoList.vue';
import { useRouter } from 'vue-router';
import { ref, computed } from 'vue';
import InfoCard from '@/components/InfoCard.vue';
import { getPhotoListInfo } from '@/service';
import { preventBack } from '@/lib/router';

const router = useRouter();
const onClickLeft = () => {
  router.back();
};

const showInfoPanel = ref(false);
const listData = ref<InfoItem[]>([]);

const activeType = ref<'image' | 'video'>('image');
const showPopover = ref(false);
const actions = [
  { text: '照片', value: 'image' },
  { text: '视频', value: 'video' },
];

const onSelect = (action: any) => {
  activeType.value = action.value;
};

const handleShowInfoPanel = async () => {
  listData.value = await getPhotoListInfo({
    isDelete: true,
    type: activeType.value
  });
  showInfoPanel.value = true;
};

preventBack(showInfoPanel);
</script>

<template>
  <van-nav-bar
    left-text="返回"
    left-arrow
    @click-left="onClickLeft"
    placeholder
    fixed
    z-index="100"
  >
    <template #title>
        <van-popover v-model:show="showPopover" :actions="actions" @select="onSelect" placement="bottom">
          <template #reference>
            <span class="nav-title">
              回收站({{ activeType === 'image' ? '照片' : '视频' }})
              <van-icon name="arrow-down" />
            </span>
          </template>
        </van-popover>
    </template>
    <template #right>
      <van-icon name="more-o" size="26" @click="handleShowInfoPanel" />
    </template>
  </van-nav-bar>

  <PhotoList v-if="activeType === 'image'" is-delete />
  <VideoList v-else is-delete />

  <van-popup v-model:show="showInfoPanel" position="right"
    :style="{ width: '100%', height: '100%', background: '#eff2f5', padding: '20px 0' }">
    <div class="safe-padding-top" style="width: 100%"></div>
    <!-- 基本信息卡片展示 -->
    <InfoCard :data="listData" />
  </van-popup>
</template>

<style scoped>
.nav-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}

.van-nav-bar__placeholder>:deep(.van-nav-bar--fixed){
  padding-top: var(--safe-area-top);
}
</style>
