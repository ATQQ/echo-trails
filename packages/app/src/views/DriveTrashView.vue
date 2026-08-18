<template>
  <div class="drive-trash-view page-container">
    <van-nav-bar
      title="回收站"
      left-arrow
      @click-left="onClickLeft"
      fixed
      placeholder
    >
      <template #right>
        <span
          v-if="items.length"
          class="nav-purge"
          @click="handlePurgeAll"
        >清空</span>
      </template>
    </van-nav-bar>

    <div v-if="items.length" class="file-list">
      <div
        v-for="item in items"
        :key="item.id"
        class="file-item"
      >
        <div class="file-icon">
          <FolderIcon v-if="item.kind === 'folder'" :size="26" />
          <van-icon v-else :name="getIcon(item).name" :color="getIcon(item).color" size="26" />
        </div>
        <div class="file-info">
          <div class="file-name">{{ item.name }}</div>
          <div class="file-meta">
            <span v-if="item.kind === 'file'">{{ formatSize(item.size) }} · </span>
            <span>{{ formatDate(item.updatedAt) }}</span>
          </div>
        </div>
        <div class="file-actions">
          <van-button
            size="small"
            plain
            type="primary"
            :loading="actingId === item.id && actionType === 'restore'"
            :disabled="actingId !== '' && actionType !== ''"
            @click="handleRestore(item)"
          >恢复</van-button>
          <van-button
            size="small"
            plain
            type="danger"
            :loading="actingId === item.id && actionType === 'purge'"
            :disabled="actingId !== '' && actionType !== ''"
            @click="handlePurge(item)"
          >彻底删除</van-button>
        </div>
      </div>
    </div>
    <div v-else-if="loading" class="list-loading">
      <div v-for="i in 6" :key="i" class="skeleton-row">
        <div class="skeleton-icon skeleton-bg"></div>
        <div class="skeleton-body">
          <div class="skeleton-name skeleton-bg"></div>
          <div class="skeleton-meta skeleton-bg"></div>
        </div>
      </div>
    </div>
    <van-empty v-else description="回收站为空" />
  </div>
</template>

<script setup lang="ts">
import { defineComponent, h, onActivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showLoadingToast, showToast, closeToast } from 'vant'
import dayjs from 'dayjs'
import {
  fetchTrashFiles,
  restoreDriveFile,
  purgeDriveFile,
  purgeAllDriveFiles,
  type DriveFileItem
} from '@/service/driveFile'

defineOptions({
  name: 'DriveTrashView'
})

// 双色文件夹图标（与 DriveView 保持一致）
const FolderIcon = defineComponent({
  name: 'FolderIcon',
  props: {
    size: { type: Number, default: 26 }
  },
  setup(props) {
    return () =>
      h(
        'svg',
        {
          viewBox: '0 0 40 32',
          width: props.size,
          height: Math.round((props.size * 32) / 40),
          'aria-hidden': 'true'
        },
        [
          h('path', {
            d: 'M2 8a3 3 0 0 1 3-3h9.2a3 3 0 0 1 2.12.88L18.4 8H37a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V8z',
            fill: '#f7b500'
          }),
          h('path', {
            d: 'M2 14h36v11a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V14z',
            fill: '#ffd05b'
          })
        ]
      )
  }
})

const router = useRouter()

const items = ref<DriveFileItem[]>([])
const loading = ref(false)
// 单项操作锁：避免并发触发 DB/S3 异步竞争
const actingId = ref('')
const actionType = ref<'' | 'restore' | 'purge'>('')

const onClickLeft = () => {
  if (router.options.history.state.back) {
    router.back()
    return
  }
  router.replace('/files')
}

const refresh = async () => {
  if (!items.value.length) loading.value = true
  try {
    items.value = await fetchTrashFiles()
  } catch (e) {
    console.error('[DriveTrash] load failed:', e)
    showToast('加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refresh()
})

let skipActivateRefresh = true
onActivated(() => {
  if (skipActivateRefresh) {
    skipActivateRefresh = false
    return
  }
  refresh()
})

const handleRestore = async (item: DriveFileItem) => {
  actingId.value = item.id
  actionType.value = 'restore'
  const toast = showLoadingToast({ message: '恢复中...', forbidClick: true, duration: 0 })
  try {
    await restoreDriveFile(item.id)
    closeToast()
    showToast('已恢复')
    items.value = items.value.filter((v) => v.id !== item.id)
  } catch (e) {
    closeToast()
    console.error('[DriveTrash] restore failed:', e)
    showToast('恢复失败')
  } finally {
    actingId.value = ''
    actionType.value = ''
  }
}

const handlePurge = (item: DriveFileItem) => {
  showConfirmDialog({
    title: '彻底删除',
    message:
      item.kind === 'folder'
        ? `彻底删除"${item.name}"将同时删除其中的所有内容，且不可恢复，确定继续吗？`
        : `彻底删除"${item.name}"后不可恢复，确定继续吗？`
  })
    .then(async () => {
      actingId.value = item.id
      actionType.value = 'purge'
      const toast = showLoadingToast({
        message: '删除中...',
        forbidClick: true,
        duration: 0
      })
      try {
        await purgeDriveFile(item.id)
        closeToast()
        showToast('已彻底删除')
        items.value = items.value.filter((v) => v.id !== item.id)
      } catch (e) {
        closeToast()
        console.error('[DriveTrash] purge failed:', e)
        showToast(e instanceof Error ? e.message : '删除失败')
      } finally {
        actingId.value = ''
        actionType.value = ''
      }
    })
    .catch(() => {
      // 取消
    })
}

const handlePurgeAll = () => {
  showConfirmDialog({
    title: '清空回收站',
    message: '将彻底删除回收站中的所有项目，且不可恢复，确定继续吗？'
  })
    .then(async () => {
      const toast = showLoadingToast({
        message: '清空中...',
        forbidClick: true,
        duration: 0
      })
      try {
        await purgeAllDriveFiles()
        closeToast()
        showToast('已清空')
        items.value = []
      } catch (e) {
        closeToast()
        console.error('[DriveTrash] purge-all failed:', e)
        showToast(e instanceof Error ? e.message : '清空失败')
      }
    })
    .catch(() => {
      // 取消
    })
}

// ==================== 工具函数 ====================

const getIconByMime = (mime = '') => {
  if (mime.startsWith('image/')) return { name: 'photo-o', color: '#07c160' }
  if (mime.startsWith('video/')) return { name: 'video-o', color: '#1989fa' }
  if (mime.startsWith('audio/')) return { name: 'music-o', color: '#ff976a' }
  if (mime === 'application/pdf') return { name: 'description', color: '#ee0a24' }
  return { name: 'description', color: '#969799' }
}

const getIcon = (item: DriveFileItem) => {
  if (item.kind === 'folder') return { name: 'apps-o', color: '#ff976a' }
  return getIconByMime(item.mimeType)
}

const formatSize = (size: number) => {
  if (!size) return '0B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let index = 0
  let value = size
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index++
  }
  return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)}${units[index]}`
}

const formatDate = (ts: number) => dayjs(ts).format('YYYY-MM-DD HH:mm')
</script>

<style lang="scss" scoped>
@use '@/styles/breakpoints.scss' as *;

.drive-trash-view {
  min-height: 100vh;
  background-color: #f7f8fa;
  padding-bottom: 40px;
  box-sizing: border-box;

  :deep(.van-nav-bar__placeholder > .van-nav-bar--fixed) {
    padding-top: var(--safe-area-top);
  }

  .nav-purge {
    font-size: 14px;
    color: #ee0a24;
    cursor: pointer;
  }

  .file-list {
    margin: 0 12px;
    background: #fff;
    border-radius: 12px;
    overflow: hidden;

    @include desktop {
      margin: 0 32px;
    }
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid #f5f6f7;

    &:last-child {
      border-bottom: none;
    }

    .file-icon {
      flex-shrink: 0;
    }

    .file-info {
      flex: 1;
      min-width: 0;

      .file-name {
        font-size: 14px;
        color: #323233;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .file-meta {
        margin-top: 2px;
        font-size: 12px;
        color: #969799;
      }
    }

    .file-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;

      :deep(.van-button) {
        padding: 0 10px;
        height: 28px;
      }
    }
  }

  .list-loading {
    margin: 0 12px;
    background: #fff;
    border-radius: 12px;
    overflow: hidden;

    @include desktop {
      margin: 0 32px;
    }
  }

  .skeleton-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid #f5f6f7;

    &:last-child {
      border-bottom: none;
    }
  }

  .skeleton-bg {
    background: linear-gradient(90deg, #f2f3f5 25%, #e8eaed 37%, #f2f3f5 63%);
    background-size: 400% 100%;
    animation: skeleton-loading 1.4s ease infinite;
  }

  .skeleton-icon {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    flex-shrink: 0;
  }

  .skeleton-body {
    flex: 1;
    min-width: 0;
  }

  .skeleton-name {
    width: 46%;
    height: 14px;
    border-radius: 4px;
  }

  .skeleton-meta {
    width: 28%;
    height: 10px;
    border-radius: 4px;
    margin-top: 8px;
  }

  @keyframes skeleton-loading {
    0% { background-position: 100% 50%; }
    100% { background-position: 0 50%; }
  }
}
</style>
