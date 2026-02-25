<template>
  <div class="discovery-view">
    <div class="header safe-padding-top">
      <div>
        <h2>发现</h2>
        <p class="subtitle">更多实用功能</p>
      </div>
      <div class="header-actions">
        <van-icon :name="showEditFooter ? 'success' : 'edit'" size="26" @click="showEditFooter = !showEditFooter" />
        <van-icon name="setting-o" size="26" @click="handleGoManagePage" />
      </div>
    </div>

    <div class="section-title">健康管理</div>
    <van-grid :column-num="2" :gutter="10" clickable>
      <van-grid-item v-for="item in healthApps" :key="item.text" @click="handleClick(item)">
        <div class="grid-item-content">
          <div class="icon-wrapper">
            <van-icon :name="item.icon" :color="item.color" size="28" />
            <span v-if="!item.url" class="dev-tag">待上线</span>
          </div>
          <span class="grid-text">{{ item.text }}</span>
          <van-icon v-if="item.url && showEditFooter" :name="footerStore.isAdded(item.url) ? 'clear' : 'add'" class="action-icon"
            :color="footerStore.isAdded(item.url) ? '#ee0a24' : '#1989fa'" @click.stop="toggleFooter(item)" />
        </div>
      </van-grid-item>
    </van-grid>

    <div class="section-title">娱乐媒体</div>
    <van-grid :column-num="2" :gutter="10" clickable>
      <van-grid-item v-for="item in mediaApps" :key="item.text" @click="handleClick(item)">
        <div class="grid-item-content">
          <div class="icon-wrapper">
            <van-icon :name="item.icon" :color="item.color" size="28" />
            <span v-if="!item.url" class="dev-tag">待上线</span>
          </div>
          <span class="grid-text">{{ item.text }}</span>
          <van-icon v-if="item.url && showEditFooter" :name="footerStore.isAdded(item.url) ? 'clear' : 'add'" class="action-icon"
            :color="footerStore.isAdded(item.url) ? '#ee0a24' : '#1989fa'" @click.stop="toggleFooter(item)" />
        </div>
      </van-grid-item>
    </van-grid>

    <div class="section-title">其他工具</div>
    <van-grid :column-num="4" :gutter="10" clickable>
      <van-grid-item v-for="item in otherApps" :key="item.text" @click="handleClick(item)">
        <div class="grid-item-content">
          <div class="icon-wrapper">
            <van-icon :name="item.icon" :color="item.color" size="28" />
            <span v-if="!item.url" class="dev-tag">待上线</span>
          </div>
          <span class="grid-text">{{ item.text }}</span>
          <van-icon v-if="item.url && showEditFooter" :name="footerStore.isAdded(item.url) ? 'clear' : 'add'" class="action-icon"
            :color="footerStore.isAdded(item.url) ? '#ee0a24' : '#1989fa'" @click.stop="toggleFooter(item)" />
        </div>
      </van-grid-item>
    </van-grid>
  </div>
</template>

<script setup lang="ts">
import { checkLogin } from '@/service';
import { showToast, showConfirmDialog } from 'vant';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useFooterStore } from '@/stores/footer';

const router = useRouter();
const footerStore = useFooterStore();
const showEditFooter = ref(false);

onMounted(() => {
  checkLogin().then((res) => {
    if (res.code !== 0) {
      throw new Error('未登录');
    }
  }).catch(() => {
    router.replace('/login');
  });
});

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
  { text: '血压监测', icon: 'like-o', color: '#ee0a24', url: '/blood-pressure' },
]);

const mediaApps = ref<AppItem[]>([
  { text: '视频', icon: 'video-o', color: '#07c160', url: '/video' },
  { text: '音频', icon: 'music-o', color: '#ff976a' },
]);

const otherApps = ref<AppItem[]>([
  { text: '资产', icon: 'gold-coin-o', color: '#ffd700', url: '/asset' },
  { text: '纪念日', icon: 'calendar-o', color: '#f2826a', url: '/memorial' },
  { text: '交流', icon: 'chat-o', color: '#07c160' },
  { text: '待办事项', icon: 'todo-list-o', color: '#6739b6' },
  { text: '更多', icon: 'ellipsis', color: '#969799' },
]);

const handleClick = (item: AppItem) => {
  if (item.url) {
    // Navigate if url exists
    router.push(item.url);
  } else {
    showToast('功能待上线，敬请期待');
  }
};

const toggleFooter = (item: AppItem) => {
  const url = item.url;
  if (!url) {
    showToast('该功能暂未上线，无法添加到首页');
    return;
  }

  if (footerStore.isAdded(url)) {
    showConfirmDialog({
      title: '移除入口',
      message: `确定要从底部导航移除"${item.text}"入口吗？`,
    }).then(() => {
      if (footerStore.removeItem(url)) {
        showToast('已移除');
      }
    }).catch(() => {});
  } else {
    const success = footerStore.addItem({
      icon: item.icon,
      text: item.text,
      path: url,
      activeIcon: item.icon, // reusing the same icon
      activeColor: item.color,
      replace: false
    });
    if (success) {
      showToast('已添加到底部导航');
    } else {
      showToast('底部导航最多添加5个入口');
    }
  }
}
</script>

<style lang="scss" scoped>
.discovery-view {
  padding: 20px 16px;
  background-color: #f7f8fa;
  min-height: 100vh;
  padding-bottom: 80px; // Space for bottom nav
  box-sizing: border-box;

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

  .header-actions {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .section-title {
    margin: 24px 0 12px;
    font-size: 16px;
    font-weight: 600;
    color: #323233;
  }

  .icon-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .dev-tag {
    position: absolute;
    top: -20px;
    right: -30px;
    background-color: #c8c9cc;
    color: #fff;
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 4px;
    transform: scale(0.8);
    white-space: nowrap;
  }

  .action-icon {
    position: absolute;
    top: -5px;
    right: -5px;
    z-index: 2;
    padding: 8px;
  }

  .grid-item-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    position: relative;
    padding: 6px 0 2px 0;
  }

  .grid-text {
    font-size: 12px;
    color: #646566;
    margin-top: 8px;
    line-height: 1.5;
  }
}
</style>
