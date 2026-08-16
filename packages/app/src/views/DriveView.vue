<template>
  <div class="drive-view page-container">
    <van-nav-bar title="文件" left-arrow @click-left="onClickLeft" fixed placeholder />

    <!-- 面包屑 -->
    <div class="breadcrumb">
      <span class="crumb" :class="{ active: !currentParentId }" @click="navigateTo('')">
        <van-icon name="wap-home-o" /> 根目录
      </span>
      <template v-for="crumb in breadcrumb" :key="crumb.id">
        <span class="crumb-sep">/</span>
        <span class="crumb" :class="{ active: crumb.id === currentParentId }" @click="navigateTo(crumb.id)">
          {{ crumb.name }}
        </span>
      </template>
    </div>

    <!-- 文件列表 -->
    <div class="file-list" v-if="items.length">
      <div v-for="item in items" :key="item.id" class="file-item" @click="handleItemClick(item)">
        <div class="file-icon">
          <van-icon :name="getIcon(item).name" :color="getIcon(item).color" size="26" />
        </div>
        <div class="file-info">
          <div class="file-name">{{ item.name }}</div>
          <div class="file-meta">
            <span v-if="item.kind === 'file'">{{ formatSize(item.size) }} · </span>
            <span>{{ formatDate(item.updatedAt) }}</span>
            <van-tag v-if="item.provider && item.provider !== 'bitiful'" plain type="primary" class="provider-tag">
              {{ item.provider }}
            </van-tag>
          </div>
        </div>
        <van-icon name="ellipsis" size="16" color="#c8c9cc" @click.stop="openActionSheet(item)" />
      </div>
    </div>
    <van-empty v-else description="目录为空，点击右下角按钮上传文件或新建文件夹" />

    <!-- 新增入口：上传（主） + 新建文件夹（次） -->
    <div class="fab-group" v-show="!showFolderDialog">
      <div class="fab-btn fab-btn--plain" @click="openCreateFolder">
        <van-icon name="add-o" size="16" />
      </div>
      <div class="fab-btn fab-btn--primary" @click="triggerUpload">
        <van-icon name="upgrade" size="16" />
      </div>
    </div>

    <!-- 操作面板 -->
    <van-action-sheet v-model:show="showActions" :actions="actions" cancel-text="取消" @select="onActionSelect" />

    <!-- 新建文件夹（居中弹窗） -->
    <van-dialog
      v-model:show="showFolderDialog"
      title="新建文件夹"
      show-cancel-button
      confirm-button-text="创建"
      :before-close="onFolderBeforeClose"
    >
      <div class="dialog-body">
        <van-field v-model="folderName" placeholder="请输入文件夹名称" maxlength="50" />
      </div>
    </van-dialog>

    <!-- 重命名 -->
    <van-popup v-model:show="showRenameDialog" position="bottom" round class="safe-padding-top">
      <div class="form-container">
        <div class="form-title">重命名</div>
        <van-field v-model="renameName" placeholder="请输入名称" maxlength="100" />
        <div class="form-actions">
          <van-button block plain type="default" @click="showRenameDialog = false">取消</van-button>
          <van-button block plain type="primary" :loading="submitting" @click="handleRename">确定</van-button>
        </div>
      </div>
    </van-popup>

    <!-- 移动到 -->
    <van-popup v-model:show="showMoveDialog" position="bottom" round class="safe-padding-top">
      <div class="move-container">
        <div class="form-title">移动到</div>
        <div class="move-breadcrumb">
          <span class="crumb" :class="{ active: !moveBrowseId }" @click="moveBrowseTo('')">根目录</span>
          <template v-for="crumb in moveBreadcrumb" :key="crumb.id">
            <span class="crumb-sep">/</span>
            <span class="crumb" :class="{ active: crumb.id === moveBrowseId }" @click="moveBrowseTo(crumb.id)">
              {{ crumb.name }}
            </span>
          </template>
        </div>
        <div class="move-list">
          <div v-if="!moveSubFolders.length" class="empty-tip">没有子文件夹</div>
          <div v-for="folder in moveSubFolders" :key="folder.id" class="file-item" @click="moveBrowseTo(folder.id)">
            <van-icon name="apps-o" color="#ff976a" size="22" />
            <span class="file-name">{{ folder.name }}</span>
            <van-icon name="arrow" size="14" color="#c8c9cc" />
          </div>
        </div>
        <div class="form-actions">
          <van-button block plain type="default" @click="showMoveDialog = false">取消</van-button>
          <van-button block plain type="primary" :disabled="moveBrowseId === actingItem?.parentId" :loading="submitting"
            @click="handleMove">
            移动到当前目录
          </van-button>
        </div>
      </div>
    </van-popup>

    <!-- 分享 -->
    <van-popup v-model:show="showShareDialog" position="bottom" round class="safe-padding-top">
      <div class="form-container">
        <div class="form-title">分享链接</div>
        <div class="share-file-name">
          <van-icon :name="getIcon(actingItem).name" :color="getIcon(actingItem).color" size="18" />
          {{ actingItem?.name }}
        </div>
        <van-radio-group v-model="shareExpires" direction="horizontal" class="share-expires">
          <van-radio :name="86400">1 天</van-radio>
          <van-radio :name="604800">7 天</van-radio>
          <van-radio :name="2592000">30 天</van-radio>
        </van-radio-group>
        <van-field v-if="shareUrl" v-model="shareUrl" readonly placeholder="链接生成中...">
          <template #button>
            <van-button size="small" type="primary" @click="copyShareUrl">复制</van-button>
          </template>
        </van-field>
        <div class="form-actions">
          <van-button block plain type="default" @click="showShareDialog = false">关闭</van-button>
          <van-button block plain type="primary" :loading="generating" @click="handleShare">生成链接</van-button>
        </div>
      </div>
    </van-popup>

    <!-- 上传 input -->
    <input ref="fileInputRef" type="file" multiple class="hidden-input" @change="onFileChange" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showLoadingToast, showToast, closeToast } from 'vant';
import dayjs from 'dayjs';
import {
  fetchDriveFiles,
  createFolder,
  createDriveFile,
  renameDriveFile,
  moveDriveFile,
  deleteDriveFile,
  getShareUrl,
  getDownloadUrl,
  type DriveFileItem,
  type DriveBreadcrumb,
} from '@/service/driveFile';
import { getUploadUrl, uploadFile } from '@/service';
import { randomUUID } from '@/lib/util';
import { preventBack } from '@/lib/router';
import { isTauri } from '@/constants';
import { openUrl } from '@tauri-apps/plugin-opener';

defineOptions({
  name: 'DriveView'
});

const router = useRouter();

const items = ref<DriveFileItem[]>([]);
const breadcrumb = ref<DriveBreadcrumb[]>([]);
const currentParentId = ref('');
const loading = ref(false);
const submitting = ref(false);

const showActions = ref(false);
const showFolderDialog = ref(false);
const showRenameDialog = ref(false);
const showMoveDialog = ref(false);
const showShareDialog = ref(false);

const actingItem = ref<DriveFileItem | null>(null);
const folderName = ref('');
const renameName = ref('');

// 移动弹窗的浏览状态
const moveBrowseId = ref('');
const moveBreadcrumb = ref<DriveBreadcrumb[]>([]);
const moveSubFolders = ref<DriveFileItem[]>([]);

// 分享状态
const shareExpires = ref(86400);
const shareUrl = ref('');
const generating = ref(false);

const fileInputRef = ref<HTMLInputElement | null>(null);

preventBack(showActions);
preventBack(showFolderDialog);
preventBack(showRenameDialog);
preventBack(showMoveDialog);
preventBack(showShareDialog);

const onClickLeft = () => {
  if (currentParentId.value && breadcrumb.value.length) {
    navigateTo(breadcrumb.value[breadcrumb.value.length - 2]?.id || '');
    return;
  }
  router.back();
};

const actions = computed(() => {
  if (!actingItem.value) return [];
  if (actingItem.value.kind === 'folder') {
    return [
      { name: '重命名', action: 'rename' },
      { name: '移动', action: 'move' },
      { name: '删除', action: 'delete', color: '#ee0a24' },
    ];
  }
  return [
    { name: '下载', action: 'download' },
    { name: '分享', action: 'share' },
    { name: '重命名', action: 'rename' },
    { name: '移动', action: 'move' },
    { name: '删除', action: 'delete', color: '#ee0a24' },
  ];
});

const refresh = async () => {
  loading.value = true;
  try {
    const result = await fetchDriveFiles(currentParentId.value);
    items.value = result.items;
    breadcrumb.value = result.breadcrumb;
  } catch (e) {
    console.error('[Drive] load failed:', e);
    showToast('加载失败');
  } finally {
    loading.value = false;
  }
};

onMounted(refresh);

const navigateTo = (id: string) => {
  if (id === currentParentId.value) return;
  currentParentId.value = id;
  refresh();
};

const handleItemClick = (item: DriveFileItem) => {
  if (item.kind === 'folder') {
    navigateTo(item.id);
  } else {
    openActionSheet(item);
  }
};

const openActionSheet = (item: DriveFileItem) => {
  actingItem.value = item;
  showActions.value = true;
};

const onActionSelect = (action: any) => {
  showActions.value = false;
  const item = actingItem.value;
  if (!item) return;

  switch (action.action) {
    case 'download':
      handleDownload(item);
      break;
    case 'share':
      openShare(item);
      break;
    case 'rename':
      renameName.value = item.name;
      showRenameDialog.value = true;
      break;
    case 'move':
      openMove(item);
      break;
    case 'delete':
      handleDelete(item);
      break;
  }
};

const handleDownload = async (item: DriveFileItem) => {
  const toast = showLoadingToast({ message: '生成下载链接...', forbidClick: true, duration: 0 });
  try {
    const url = await getDownloadUrl(item);
    closeToast();
    if (isTauri) {
      await openUrl(url);
    } else {
      window.open(url, '_blank');
    }
  } catch (e) {
    closeToast();
    console.error('[Drive] download failed:', e);
    showToast(e instanceof Error ? e.message : '下载失败');
  }
};

const openShare = (item: DriveFileItem) => {
  actingItem.value = item;
  shareUrl.value = '';
  shareExpires.value = 86400;
  showShareDialog.value = true;
};

const handleShare = async () => {
  const item = actingItem.value;
  if (!item) return;
  generating.value = true;
  try {
    shareUrl.value = await getShareUrl(item, shareExpires.value);
  } catch (e) {
    console.error('[Drive] share failed:', e);
    showToast(e instanceof Error ? e.message : '生成分享链接失败');
  } finally {
    generating.value = false;
  }
};

const copyShareUrl = async () => {
  if (!shareUrl.value) return;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(shareUrl.value);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl.value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    showToast('已复制');
  } catch (e) {
    console.error('[Drive] copy failed:', e);
    showToast('复制失败');
  }
};

const handleRename = async () => {
  const item = actingItem.value;
  if (!item || !renameName.value.trim()) {
    showToast('请输入名称');
    return;
  }
  submitting.value = true;
  try {
    await renameDriveFile(item.id, renameName.value.trim());
    showRenameDialog.value = false;
    await refresh();
  } catch (e) {
    console.error('[Drive] rename failed:', e);
    showToast('重命名失败');
  } finally {
    submitting.value = false;
  }
};

const openMove = async (item: DriveFileItem) => {
  actingItem.value = item;
  moveBrowseId.value = currentParentId.value;
  await loadMoveFolder(moveBrowseId.value);
  showMoveDialog.value = true;
};

const loadMoveFolder = async (parentId: string) => {
  try {
    const result = await fetchDriveFiles(parentId);
    moveBreadcrumb.value = result.breadcrumb;
    moveSubFolders.value = result.items.filter((v) => v.kind === 'folder' && v.id !== actingItem.value?.id);
  } catch (e) {
    console.error('[Drive] load move folder failed:', e);
    showToast('加载目录失败');
  }
};

const moveBrowseTo = async (id: string) => {
  moveBrowseId.value = id;
  await loadMoveFolder(id);
};

const handleMove = async () => {
  const item = actingItem.value;
  if (!item) return;
  submitting.value = true;
  try {
    await moveDriveFile(item.id, moveBrowseId.value);
    showMoveDialog.value = false;
    showToast('移动成功');
    await refresh();
  } catch (e) {
    console.error('[Drive] move failed:', e);
    showToast(e instanceof Error ? e.message : '移动失败');
  } finally {
    submitting.value = false;
  }
};

const handleDelete = (item: DriveFileItem) => {
  const message = item.kind === 'folder'
    ? '删除文件夹将同时删除其中的所有内容，确定删除吗？'
    : `确定要删除"${item.name}"吗？`;
  showConfirmDialog({
    title: '删除',
    message,
  }).then(async () => {
    try {
      await deleteDriveFile(item.id);
      showToast('已删除');
      await refresh();
    } catch (e) {
      console.error('[Drive] delete failed:', e);
      showToast('删除失败');
    }
  }).catch(() => {
    // 取消
  });
};

const openCreateFolder = () => {
  folderName.value = '';
  showFolderDialog.value = true;
};

// van-dialog before-close：校验/请求通过才关闭弹窗
const onFolderBeforeClose = async (action: string) => {
  if (action !== 'confirm') return true;
  const name = folderName.value.trim();
  if (!name) {
    showToast('请输入文件夹名称');
    return false;
  }
  submitting.value = true;
  try {
    await createFolder(name, currentParentId.value);
    await refresh();
    return true;
  } catch (e) {
    console.error('[Drive] create folder failed:', e);
    showToast('创建失败');
    return false;
  } finally {
    submitting.value = false;
  }
};

// ==================== 上传 ====================

const triggerUpload = () => {
  fileInputRef.value?.click();
};

const onFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length) return;

  for (const file of files) {
    await uploadOne(file);
  }
  await refresh();
};

const uploadOne = async (file: File) => {
  const toast = showLoadingToast({ message: `上传中：${file.name}`, forbidClick: true, duration: 0 });
  try {
    const safeName = file.name.replace(/[\\/]/g, '_');
    const key = `drive/${randomUUID()}/${safeName}`;
    const uploadUrl = await getUploadUrl(key);
    await uploadFile(file, uploadUrl);
    await createDriveFile({
      key,
      name: safeName,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      parentId: currentParentId.value,
    });
    closeToast();
    showToast(`已上传：${safeName}`);
  } catch (e) {
    closeToast();
    console.error('[Drive] upload failed:', e);
    showToast(`上传失败：${file.name}`);
  }
};

// ==================== 工具函数 ====================

const getIcon = (item: DriveFileItem | null) => {
  if (!item) return { name: 'description', color: '#969799' };
  if (item.kind === 'folder') return { name: 'apps-o', color: '#ff976a' };
  const mime = item.mimeType || '';
  if (mime.startsWith('image/')) return { name: 'photo-o', color: '#07c160' };
  if (mime.startsWith('video/')) return { name: 'video-o', color: '#1989fa' };
  if (mime.startsWith('audio/')) return { name: 'music-o', color: '#ff976a' };
  if (mime === 'application/pdf') return { name: 'description', color: '#ee0a24' };
  return { name: 'description', color: '#969799' };
};

const formatSize = (size: number) => {
  if (!size) return '0B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let value = size;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)}${units[index]}`;
};

const formatDate = (ts: number) => dayjs(ts).format('YYYY-MM-DD HH:mm');
</script>

<style lang="scss" scoped>
@use '@/styles/breakpoints.scss' as *;

.drive-view {
  min-height: 100vh;
  background-color: #f7f8fa;
  padding-bottom: 40px;
  box-sizing: border-box;

  :deep(.van-nav-bar__placeholder > .van-nav-bar--fixed) {
    padding-top: var(--safe-area-top);
  }

  // 右下角悬浮按钮组（上传 + 新建文件夹），本页无底部 tabbar
  .fab-group {
    position: fixed;
    right: 20px;
    bottom: calc(24px + env(safe-area-inset-bottom));
    z-index: 1;
    display: flex;
    gap: 10px;

    @include desktop {
      right: 32px;
      bottom: 32px;
    }
  }

  .fab-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;

    &:active {
      transform: scale(0.92);
    }

    @include desktop {
      width: 48px;
      height: 48px;

      :deep(.van-icon) {
        font-size: 20px;
      }

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }
    }

    &--primary {
      background-color: var(--van-primary-color);
      color: #fff;
    }

    &--plain {
      background-color: #fff;
      color: var(--van-primary-color);
      border: 1px solid var(--van-primary-color);
      box-sizing: border-box;
    }
  }

  .dialog-body {
    padding: 16px 16px 8px;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    padding: 12px 16px;
    gap: 4px;

    .crumb {
      font-size: 13px;
      color: #646566;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 2px;

      &.active {
        color: #323233;
        font-weight: 600;
      }
    }

    .crumb-sep {
      color: #c8c9cc;
      font-size: 12px;
      margin: 0 2px;
    }
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
    cursor: pointer;

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

        .provider-tag {
          margin-left: 6px;
        }
      }
    }
  }

  .form-container {
    padding: 20px 16px 30px;

    .form-title {
      font-size: 16px;
      font-weight: 600;
      text-align: center;
      margin-bottom: 16px;
    }

    .form-actions {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }
  }

  .move-container {
    padding: 20px 16px 30px;

    .form-title {
      font-size: 16px;
      font-weight: 600;
      text-align: center;
      margin-bottom: 12px;
    }

    .move-breadcrumb {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 8px;

      .crumb {
        font-size: 13px;
        color: #646566;
        cursor: pointer;

        &.active {
          color: #323233;
          font-weight: 600;
        }
      }

      .crumb-sep {
        color: #c8c9cc;
        font-size: 12px;
        margin: 0 2px;
      }
    }

    .move-list {
      max-height: 40vh;
      overflow-y: auto;
      border: 1px solid #f5f6f7;
      border-radius: 8px;

      .file-item {
        border-bottom: 1px solid #f5f6f7;
        padding: 10px 12px;

        .file-name {
          flex: 1;
          font-size: 14px;
          color: #323233;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }

      .empty-tip {
        text-align: center;
        color: #c8c9cc;
        font-size: 12px;
        padding: 20px 0;
      }
    }

    .form-actions {
      display: flex;
      gap: 10px;
      margin-top: 16px;
    }
  }

  .share-file-name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    color: #323233;
    margin-bottom: 12px;
    word-break: break-all;
  }

  .share-expires {
    margin-bottom: 16px;
    justify-content: space-around;
  }

  .hidden-input {
    display: none;
  }
}
</style>
