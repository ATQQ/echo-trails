<template>
  <div class="custom-swiper-container" ref="containerRef">
    <div class="custom-swiper-track" ref="trackRef" @touchstart="onTouchStart" @touchmove="onTouchMove"
      @touchend="onTouchEnd" @touchcancel="onTouchEnd">
      <div class="custom-swiper-item" v-for="item in swipeItems" :key="item.path">
        <KeepAlive>
          <component :is="getComponentForPath(item.path)" v-if="activeTabs.has(item.path)" />
        </KeepAlive>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export default { name: 'MainLayout' }
</script>

<script setup lang="ts">
import { ref, watch, defineAsyncComponent, markRaw, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';

const router = useRouter();
const route = useRoute();

const swipeItems = [
  { path: '/home' },
  { path: '/' }
];

const initialIndex = swipeItems.findIndex(i => i.path === route.path);
const currentIndex = ref(initialIndex !== -1 ? initialIndex : 0);

const componentCache = new Map<string, any>();

// 为了确保首次加载时，全部页和相册页能够同时渲染并触发各自的数据请求，
// 我们维护一个 activeTabs 集合，只要被包含在这个集合里，组件就会被真正挂载
const activeTabs = ref(new Set<string>(['/home', '/']));

const getComponentForPath = (path: string) => {
  if (componentCache.has(path)) return componentCache.get(path);

  const routeRecord = router.getRoutes().find(r => r.path === path);
  if (routeRecord && routeRecord.components) {
    let comp: any = routeRecord.components.default;
    if (typeof comp === 'function' && !comp.render && !comp.setup) {
      comp = defineAsyncComponent(comp as any);
    }
    componentCache.set(path, markRaw(comp));
    return componentCache.get(path);
  }
  return null;
};

// 预先加载并缓存组件定义
swipeItems.forEach(item => getComponentForPath(item.path));

const trackRef = ref<HTMLElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);

// 直接操作 DOM 样式，绕过 Vue 响应式，实现零延迟的丝滑跟手
const setTrackTransform = (offsetPx: number, withAnimation: boolean) => {
  if (!trackRef.value) return;
  const baseTranslate = -(currentIndex.value * 100);
  trackRef.value.style.transition = withAnimation ? 'transform 0.4s cubic-bezier(0.2, 0.9, 0.3, 1)' : 'none';
  trackRef.value.style.transform = `translate3d(calc(${baseTranslate}% + ${offsetPx}px), 0, 0)`;
};

watch(() => route.path, (newPath) => {
  const index = swipeItems.findIndex(i => i.path === newPath);
  if (index !== -1 && index !== currentIndex.value) {
    currentIndex.value = index;
    setTrackTransform(0, true);
  }
}, { immediate: true });

let isDragging = false;
let startX = 0;
let startY = 0;
let deltaX = 0;
let isDirectionX: boolean | null = null;

const onTouchStart = (e: TouchEvent) => {
  startX = e.touches[0].clientX;
  startY = e.touches[0].clientY;
  isDragging = true;
  isDirectionX = null;
  deltaX = 0;
  setTrackTransform(0, false); // 触摸瞬间立刻停止任何正在进行的动画
};

const onTouchMove = (e: TouchEvent) => {
  if (!isDragging) return;

  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;
  const dx = currentX - startX;
  const dy = currentY - startY;

  if (isDirectionX === null) {
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 5) {
      isDirectionX = true;
    } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5) {
      isDirectionX = false;
      isDragging = false; // 垂直滑动，交回给浏览器原生滚动
    }
  }

  if (isDirectionX) {
    let newDeltaX = dx;
    if (currentIndex.value === 0 && dx > 0) {
      newDeltaX = dx * 0.3; // 左边缘阻尼
    } else if (currentIndex.value === swipeItems.length - 1 && dx < 0) {
      newDeltaX = dx * 0.3; // 右边缘阻尼
    }
    deltaX = newDeltaX;
    setTrackTransform(deltaX, false); // 1:1 跟手，不带动画
  }
};

const onTouchEnd = () => {
  if (!isDragging) return;
  isDragging = false;

  if (isDirectionX) {
    const threshold = window.innerWidth * 0.3; // 30% 宽度作为切换阈值
    if (deltaX > threshold && currentIndex.value > 0) {
      switchTab(currentIndex.value - 1);
    } else if (deltaX < -threshold && currentIndex.value < swipeItems.length - 1) {
      switchTab(currentIndex.value + 1);
    } else {
      setTrackTransform(0, true); // 未达到阈值，弹回原位
    }
  }
  isDirectionX = null;
  deltaX = 0;
};

const switchTab = (index: number) => {
  currentIndex.value = index;
  setTrackTransform(0, true); // 启动弹性切换动画
  const targetPath = swipeItems[index].path;
  if (route.path !== targetPath) {
    router.replace(targetPath);
  }
};

// 拦截原生的 touchmove 事件，彻底防止 iOS 和部分安卓浏览器在横滑时触发返回/前进的系统级滑动
const preventDefaultSwipe = (e: TouchEvent) => {
  if (isDirectionX && e.cancelable) {
    e.preventDefault();
  }
};

onMounted(() => {
  if (containerRef.value) {
    // 必须使用 passive: false 才能真正 preventDefault
    containerRef.value.addEventListener('touchmove', preventDefaultSwipe, { passive: false });
  }
  setTimeout(() => setTrackTransform(0, false), 0);
});

onBeforeUnmount(() => {
  if (containerRef.value) {
    containerRef.value.removeEventListener('touchmove', preventDefaultSwipe);
  }
});
</script>

<style scoped>
.custom-swiper-container {
  width: 100%;
  height: 100%;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.custom-swiper-track {
  display: flex;
  width: 100%;
  height: 100%;
  will-change: transform;
  touch-action: pan-y;
  /* 允许垂直滚动，接管水平手势 */
}

.custom-swiper-item {
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: hidden;
  transform: translateZ(0);
  /* 强制开启独立图层，防止绘制卡顿 */
}
</style>
