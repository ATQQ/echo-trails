<script setup lang="ts">
import PhotoList from '@/components/PhotoList.vue';
import { useRouter } from 'vue-router';
import { ref } from 'vue';
import InfoCard from '@/components/InfoCard.vue';
import { getPhotoListInfo } from '@/service';
import { preventBack } from '@/lib/router';

const router = useRouter();
const onClickLeft = () => {
  router.back();
};

const showInfoPanel = ref(false);
const listData = ref<InfoItem[]>([]);

const handleShowInfoPanel = async () => {
  listData.value = await getPhotoListInfo({
    isDelete: true
  });
  showInfoPanel.value = true;
};

preventBack(showInfoPanel);
</script>

<template>
  <PhotoList :is-delete="true">
    <template #header>
      <van-nav-bar
        title="回收站"
        left-text="返回"
        left-arrow
        @click-left="onClickLeft"
        placeholder
        class="safe-padding-top"
      >
        <template #right>
          <van-icon name="more-o" size="26" @click="handleShowInfoPanel" />
        </template>
      </van-nav-bar>
    </template>
  </PhotoList>

  <van-popup v-model:show="showInfoPanel" position="right"
    :style="{ width: '100%', height: '100%', background: '#eff2f5', padding: '20px 0' }">
    <div class="safe-padding-top" style="width: 100%"></div>
    <!-- 基本信息卡片展示 -->
    <InfoCard :data="listData" />
  </van-popup>
</template>
