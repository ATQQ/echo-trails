<template>
  <aside
    class="side-nav"
    :class="{ 'is-collapsed': collapsed, 'is-tauri': isTauri }"
    aria-label="主导航"
  >
    <div class="side-nav__header">
      <h1 v-if="!collapsed" class="side-nav__brand">Echo Trails</h1>
      <button
        type="button"
        class="side-nav__toggle"
        :aria-label="collapsed ? '展开侧栏' : '收起侧栏'"
        @click="toggle"
      >
        <van-icon :name="collapsed ? 'wap-nav' : 'cross'" size="20" />
      </button>
    </div>
    <nav class="side-nav__list">
      <button
        v-for="menu in menus"
        :key="menu.path"
        type="button"
        class="side-nav__item"
        :class="{ active: isMatch(menu) }"
        :title="collapsed ? menu.text : ''"
        @click="handleClick(menu)"
      >
        <van-icon
          class="side-nav__icon"
          :name="isMatch(menu) ? (menu.activeIcon || menu.icon) : menu.icon"
          size="20"
        />
        <span v-if="!collapsed" class="side-nav__text">{{ menu.text }}</span>
      </button>
    </nav>
  </aside>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFooterStore } from '@/stores/footer'
import { useSideNavCollapsed } from '@/composables/useSideNavCollapsed'
import { isTauri } from '@/constants'

const route = useRoute()
const router = useRouter()
const footerStore = useFooterStore()
const { collapsed, toggle } = useSideNavCollapsed()

const menus = computed(() => footerStore.items)

const isMatch = (menu: { path?: string; to?: string }) => route.path === (menu.to || menu.path)

const handleClick = (menu: { path?: string; to?: string; replace?: boolean }) => {
  const target = menu.to || menu.path
  if (!target || route.path === target) return
  if (menu.replace) {
    router.replace(target)
  } else {
    router.push(target)
  }
}
</script>

<style lang="scss" scoped>
.side-nav {
  width: 200px;
  flex-shrink: 0;
  height: 100%;
  background: #fafbfc;
  border-right: 1px solid #eef0f3;
  display: flex;
  flex-direction: column;
  padding: 12px 10px;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 0.2s ease;

  &.is-collapsed {
    width: 64px;
    padding: 12px 8px;
  }

  &.is-tauri {
    padding-top: 40px;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px 16px;
    gap: 8px;
  }

  .is-collapsed &__header {
    justify-content: center;
    padding: 4px 0 16px;
  }

  &__brand {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #1a1a1a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__toggle {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: 6px;
    color: #4a5568;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease, color 0.15s ease;

    &:hover {
      background: #eef2f7;
      color: #1a1a1a;
    }
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: none;
    background: transparent;
    border-radius: 8px;
    cursor: pointer;
    color: #4a5568;
    font-size: 14px;
    text-align: left;
    transition: background 0.15s ease, color 0.15s ease;

    &:hover {
      background: #eef2f7;
      color: #1a1a1a;
    }

    &.active {
      background: #e6f1ff;
      color: #2196f3;
      font-weight: 500;
    }
  }

  .is-collapsed &__item {
    justify-content: center;
    padding: 10px 0;
    gap: 0;
  }

  &__icon {
    flex-shrink: 0;
  }

  &__text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
