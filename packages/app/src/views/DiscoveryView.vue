<template>
  <div class="discovery-view">
    <div class="header safe-padding-top">
      <div>
        <h2>发现</h2>
        <p class="subtitle">更多实用功能</p>
      </div>
      <van-icon name="setting-o" size="26" @click="handleGoManagePage" />
    </div>

    <div class="section-title">健康管理</div>
    <van-grid :column-num="2" :gutter="10" clickable>
      <van-grid-item
        v-for="item in healthApps"
        :key="item.text"
        :icon="item.icon"
        :text="item.text"
        :icon-color="item.color"
        @click="handleClick(item)"
      />
    </van-grid>

    <div class="section-title">娱乐媒体</div>
    <van-grid :column-num="2" :gutter="10" clickable>
      <van-grid-item
        v-for="item in mediaApps"
        :key="item.text"
        :icon="item.icon"
        :text="item.text"
        :icon-color="item.color"
        @click="handleClick(item)"
      />
    </van-grid>

    <div class="section-title">其他工具</div>
    <van-grid :column-num="4" :gutter="10" clickable>
      <van-grid-item
        v-for="item in otherApps"
        :key="item.text"
        :icon="item.icon"
        :text="item.text"
        :icon-color="item.color"
        @click="handleClick(item)"
      />
    </van-grid>
  </div>
</template>

<script setup lang="ts">
import { showToast } from 'vant';
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const handleGoManagePage = () => {
  router.push({
    name: 'manage'
  })
}

interface AppItem {
  text: string;
  icon: string;
  color: string;
  url?: string;
}

const healthApps = ref<AppItem[]>([
  { text: '体重记录', icon: 'chart-trending-o', color: '#1989fa', url: '/weight-record' },
  { text: '血压监测', icon: 'like-o', color: '#ee0a24' },
]);

const mediaApps = ref<AppItem[]>([
  { text: '视频', icon: 'video-o', color: '#07c160' },
  { text: '音频', icon: 'music-o', color: '#ff976a' },
]);

const otherApps = ref<AppItem[]>([
  { text: '日历', icon: 'calendar-o', color: '#7232dd' },
  { text: '计算器', icon: 'balance-o', color: '#f2826a' },
  { text: '待办事项', icon: 'todo-list-o', color: '#6739b6' },
  { text: '更多', icon: 'ellipsis', color: '#969799' },
]);

const handleClick = (item: AppItem) => {
  if (item.url) {
    // Navigate if url exists
    console.log('Navigating to', item.url);
    router.push(item.url);
  } else {
    showToast('功能开发中，敬请期待');
  }
};
</script>

<style scoped lang="scss">
.discovery-view {
  padding: 20px 16px;
  background-color: #f7f8fa;
  min-height: 100vh;
  padding-bottom: 80px; // Space for bottom nav

  .header {
    margin-bottom: 24px;
    display: flex;
    justify-content: space-between;

    h2 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
      color: #323233;
    }

    .subtitle {
      margin: 8px 0 0;
      font-size: 14px;
      color: #969799;
    }
  }

  .section-title {
    margin: 24px 0 12px;
    font-size: 16px;
    font-weight: 600;
    color: #323233;
  }
}
</style>
