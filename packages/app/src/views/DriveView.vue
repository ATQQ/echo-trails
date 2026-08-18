<template>
  <div class="drive-view page-container" :class="{ 'is-selecting': selectMode }">
    <van-nav-bar
      :title="selectMode ? `已选 ${selectedIds.length} 项` : '文件'"
      left-arrow
      @click-left="onClickLeft"
      fixed
      placeholder
    >
      <template #right>
        <span v-if="!selectMode" class="nav-action" @click="openCreateFolder">新建文件夹</span>
        <span v-if="!selectMode" class="nav-trash" @click="goTrash">回收站</span>
        <span v-if="!selectMode" class="nav-select" @click="enterSelectMode()">多选</span>
      </template>
    </van-nav-bar>

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
    <div class="file-list" v-if="visibleTasks.length || visibleItems.length">
      <div
        v-for="task in visibleTasks"
        :key="task.id"
        class="file-item is-upload"
        @click="task.status === 'error' && uploadStore.retry(task.id)"
      >
        <div class="file-icon">
          <van-icon :name="getIconByMime(task.mimeType).name" :color="getIconByMime(task.mimeType).color" size="26" />
        </div>
        <div class="file-info">
          <div class="file-name">{{ task.name }}</div>
          <div class="file-meta" v-if="task.status === 'error'">
            <span class="upload-error">{{ task.error || '上传失败' }}，点击重试</span>
          </div>
          <div class="file-meta upload-progress" v-else>
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: `${task.progress}%` }"></div>
            </div>
            <span>{{ task.status === 'pending' ? '等待中' : `${task.progress}%` }}</span>
          </div>
        </div>
        <van-icon
          v-if="task.status === 'error'"
          name="cross"
          size="16"
          color="#c8c9cc"
          @click.stop="uploadStore.remove(task.id)"
        />
      </div>
      <div
        v-for="item in visibleItems"
        :key="item.id"
        class="file-item"
        :class="{ 'is-selected': isSelected(item.id) }"
        @click="handleItemClick(item)"
        @contextmenu="openContextMenu($event, item)"
        @touchstart="handleItemTouchStart(item)"
        @touchend="handleItemTouchEnd"
        @touchcancel="handleItemTouchEnd"
        @touchmove="handleItemTouchEnd"
      >
        <div v-if="selectMode" class="select-indicator" :class="{ checked: isSelected(item.id) }">
          <van-icon v-if="isSelected(item.id)" name="success" size="12" />
        </div>
        <div class="file-icon">
          <FolderIcon v-if="item.kind === 'folder'" :size="26" />
          <van-icon v-else :name="getIcon(item).name" :color="getIcon(item).color" size="26" />
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
        <van-icon v-if="!selectMode" name="ellipsis" size="16" color="#c8c9cc" @click.stop="openActionSheet(item)" />
      </div>
    </div>
    <div v-else-if="loading" class="list-loading">
      <div class="skeleton-row" v-for="i in 6" :key="i">
        <div class="skeleton-icon skeleton-bg"></div>
        <div class="skeleton-body">
          <div class="skeleton-name skeleton-bg"></div>
          <div class="skeleton-meta skeleton-bg"></div>
        </div>
      </div>
    </div>
    <van-empty v-else description="目录为空，点击右下角按钮上传文件或新建文件夹" />

    <!-- 新增入口：上传（菜单选择） -->
    <div class="fab-group" v-show="!showFolderDialog && !selectMode">
      <div class="fab-btn fab-btn--primary" :class="{ 'is-busy': folderUploading }" @click="triggerUploadMenu">
        <van-icon :name="folderUploading ? 'loading' : 'plus'" size="16" :class="{ 'van-icon-spin': folderUploading }" />
      </div>
    </div>

    <!-- 操作面板 -->
    <van-action-sheet v-model:show="showActions" :actions="actions" cancel-text="取消" @select="onActionSelect" />

    <!-- 桌面端右键上下文菜单：定位到鼠标位置，遮罩捕获外部点击/右键关闭 -->
    <template v-if="contextMenu">
      <div class="context-menu-mask" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu"></div>
      <div
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <div
          v-for="action in contextMenuActions"
          :key="action.action"
          class="context-menu-item"
          :class="{ 'is-danger': action.color === '#ee0a24' }"
          @click="onContextMenuSelect(action)"
        >
          {{ action.name }}
        </div>
      </div>
    </template>

    <!-- 上传方式选择面板 -->
    <van-action-sheet v-model:show="showUploadMenu" :actions="uploadActions" cancel-text="取消" @select="onUploadActionSelect" />

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
            <FolderIcon :size="22" />
            <span class="file-name">{{ folder.name }}</span>
            <van-icon name="arrow" size="14" color="#c8c9cc" />
          </div>
        </div>
        <div class="form-actions">
          <van-button block plain type="default" @click="showMoveDialog = false">取消</van-button>
          <van-button block plain type="primary" :disabled="!canMoveHere" :loading="submitting"
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
        <div class="share-file-name" v-if="shareTargets.length <= 1">
          <FolderIcon v-if="(shareTargets[0] ?? actingItem)?.kind === 'folder'" :size="18" />
          <van-icon v-else :name="getIcon(shareTargets[0] ?? actingItem).name" :color="getIcon(shareTargets[0] ?? actingItem).color" size="18" />
          {{ shareTargets[0]?.name || actingItem?.name }}
        </div>
        <div v-else class="share-file-name">{{ shareTargets.length }} 个文件</div>
        <van-radio-group v-model="shareExpires" direction="horizontal" class="share-expires">
          <van-radio :name="86400">1 天</van-radio>
          <van-radio :name="604800">7 天</van-radio>
          <van-radio :name="2592000">30 天</van-radio>
        </van-radio-group>
        <van-field
          v-if="shareUrl"
          v-model="shareUrl"
          :type="shareTargets.length > 1 ? 'textarea' : 'text'"
          :autosize="shareTargets.length > 1 ? { maxHeight: 160 } : false"
          readonly
          placeholder="链接生成中..."
        >
          <template #button>
            <van-button size="small" type="primary" @click="copyShareUrl">{{ shareTargets.length > 1 ? '复制全部' : '复制' }}</van-button>
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
    <!-- 上传文件夹 input：webkitdirectory 让用户选择整个目录 -->
    <input
      ref="folderInputRef"
      type="file"
      webkitdirectory
      directory
      multiple
      class="hidden-input"
      @change="onFolderChange"
    />

    <DriveSelectBar
      :visible="selectMode"
      :count="selectedIds.length"
      :share-disabled="!selectedFiles.length"
      @move="openBatchMove"
      @share="openBatchShare"
      @delete="handleBatchDelete"
      @cancel="exitSelectMode"
    />

    <DriveFilePreview v-model:show="showPreview" :item="previewItem" />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent, h, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showLoadingToast, showToast, closeToast } from 'vant';
import dayjs from 'dayjs';
import {
  fetchDriveFiles,
  createFolder,
  renameDriveFile,
  moveDriveFile,
  deleteDriveFile,
  getShareUrl,
  getDownloadUrl,
  type DriveFileItem,
  type DriveBreadcrumb,
} from '@/service/driveFile';
import { preventBack } from '@/lib/router';
import { isTauri } from '@/constants';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useDriveUploadStore } from '@/stores/driveUpload';
import { useResponsive } from '@/composables/useResponsive';
import DriveSelectBar from '@/components/DriveSelectBar/index.vue';

const { isDesktop } = useResponsive();

const DriveFilePreview = defineAsyncComponent(() => import('@/components/DriveFilePreview/index.vue'));

// 双色文件夹图标（Vant 无 folder 图标，内联 SVG 实现）
const FolderIcon = defineComponent({
  name: 'FolderIcon',
  props: {
    size: { type: Number, default: 26 },
  },
  setup(props) {
    return () =>
      h(
        'svg',
        {
          viewBox: '0 0 40 32',
          width: props.size,
          height: Math.round((props.size * 32) / 40),
          'aria-hidden': 'true',
        },
        [
          h('path', {
            d: 'M2 8a3 3 0 0 1 3-3h9.2a3 3 0 0 1 2.12.88L18.4 8H37a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V8z',
            fill: '#f7b500',
          }),
          h('path', {
            d: 'M2 14h36v11a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V14z',
            fill: '#ffd05b',
          }),
        ],
      );
  },
});

defineOptions({
  name: 'DriveView'
});

const router = useRouter();
const uploadStore = useDriveUploadStore();

const items = ref<DriveFileItem[]>([]);
const breadcrumb = ref<DriveBreadcrumb[]>([]);
const currentParentId = ref('');
const loading = ref(false);

const visibleTasks = computed(() => uploadStore.tasksFor(currentParentId.value));
const visibleItems = computed(() => {
  const existingIds = new Set(items.value.map((item) => item.id));
  const finished = uploadStore.finishedFor(currentParentId.value, existingIds);
  return [...finished, ...items.value];
});
const submitting = ref(false);

const showActions = ref(false);
const showUploadMenu = ref(false);
const showFolderDialog = ref(false);
const showRenameDialog = ref(false);
const showMoveDialog = ref(false);
const showShareDialog = ref(false);
const showPreview = ref(false);
const previewItem = ref<DriveFileItem | null>(null);

const actingItem = ref<DriveFileItem | null>(null);
const folderName = ref('');
const renameName = ref('');

// 桌面端右键上下文菜单
const contextMenu = ref<{ x: number; y: number } | null>(null);
const contextItem = ref<DriveFileItem | null>(null);

// 移动弹窗的浏览状态
const moveBrowseId = ref('');
const moveBreadcrumb = ref<DriveBreadcrumb[]>([]);
const moveSubFolders = ref<DriveFileItem[]>([]);

// 分享状态
const shareExpires = ref(86400);
const shareUrl = ref('');
const generating = ref(false);
const shareTargets = ref<DriveFileItem[]>([]);
const movingItems = ref<DriveFileItem[]>([]);

const fileInputRef = ref<HTMLInputElement | null>(null);
const folderInputRef = ref<HTMLInputElement | null>(null);
const folderUploading = ref(false);

const selectMode = ref(false);
const selectedIds = ref<string[]>([]);
const selectedItems = computed(() => visibleItems.value.filter((item) => selectedIds.value.includes(item.id)));
const selectedFiles = computed(() => selectedItems.value.filter((item) => item.kind === 'file'));

const isFolderBlockedDest = (item: DriveFileItem) => {
  if (item.kind !== 'folder') return false;
  if (item.id === moveBrowseId.value) return true;
  return moveBreadcrumb.value.some((crumb) => crumb.id === item.id);
};

const canMoveItemHere = (item: DriveFileItem) =>
  (item.parentId || '') !== moveBrowseId.value && !isFolderBlockedDest(item);

const canMoveHere = computed(() => movingItems.value.some(canMoveItemHere));

preventBack(showActions);
preventBack(showUploadMenu);
preventBack(showFolderDialog);
preventBack(showRenameDialog);
preventBack(showMoveDialog);
preventBack(showShareDialog);
preventBack(selectMode);

const onClickLeft = () => {
  if (selectMode.value) {
    exitSelectMode();
    return;
  }
  if (currentParentId.value && breadcrumb.value.length) {
    navigateTo(breadcrumb.value[breadcrumb.value.length - 2]?.id || '');
    return;
  }
  router.back();
};

const goTrash = () => {
  router.push('/files/trash');
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
    { name: '预览', action: 'preview' },
    { name: '下载', action: 'download' },
    { name: '分享', action: 'share' },
    { name: '重命名', action: 'rename' },
    { name: '移动', action: 'move' },
    { name: '删除', action: 'delete', color: '#ee0a24' },
  ];
});

const applyList = (result: { items: DriveFileItem[]; breadcrumb: DriveBreadcrumb[] }) => {
  items.value = result.items;
  breadcrumb.value = result.breadcrumb;
  uploadStore.pruneFinished(result.items);
};

// 上传方式：移动端仅"上传文件"，桌面端追加"上传文件夹"（webkitdirectory 移动端支持差）
const uploadActions = computed(() => {
  const list: { name: string; action: string }[] = [{ name: '上传文件', action: 'file' }];
  if (isDesktop) {
    list.push({ name: '上传文件夹', action: 'folder' });
  }
  return list;
});

const triggerUploadMenu = () => {
  if (folderUploading.value) return;
  if (uploadActions.value.length === 1) {
    triggerUpload();
  } else {
    showUploadMenu.value = true;
  }
};

const onUploadActionSelect = (action: any) => {
  showUploadMenu.value = false;
  if (action.action === 'file') triggerUpload();
  else if (action.action === 'folder') triggerUploadFolder();
};

// 子目录预加载缓存：parentId -> 目录数据
const childrenCache = new Map<string, { items: DriveFileItem[]; breadcrumb: DriveBreadcrumb[] }>();

const preloadChildren = (folderItems: DriveFileItem[]) => {
  for (const item of folderItems) {
    if (item.kind !== 'folder') continue;
    if (childrenCache.has(item.id)) continue;
    fetchDriveFiles(item.id)
      .then((result) => {
        childrenCache.set(item.id, result);
      })
      .catch(() => {
        // 预加载失败静默忽略，点击时再实时拉取
      });
  }
};

const invalidateCache = () => {
  childrenCache.clear();
};

const refresh = async (showSpinner = true) => {
  if (showSpinner && !items.value.length && !visibleTasks.value.length) {
    loading.value = true;
  }
  try {
    const result = await fetchDriveFiles(currentParentId.value);
    childrenCache.set(currentParentId.value, result);
    applyList(result);
    preloadChildren(result.items);
  } catch (e) {
    console.error('[Drive] load failed:', e);
    showToast('加载失败');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  refresh();
  window.addEventListener('keydown', onContextMenuKeydown);
  document.addEventListener('scroll', onContextMenuScrollOrBlur, true);
  window.addEventListener('blur', onContextMenuScrollOrBlur);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onContextMenuKeydown);
  document.removeEventListener('scroll', onContextMenuScrollOrBlur, true);
  window.removeEventListener('blur', onContextMenuScrollOrBlur);
});

let skipActivateRefresh = true;
onActivated(() => {
  if (skipActivateRefresh) {
    skipActivateRefresh = false;
    return;
  }
  refresh(false);
});

watch(() => uploadStore.revision, () => {
  invalidateCache();
  refresh(false);
});

const navigateTo = (id: string) => {
  if (id === currentParentId.value) return;
  exitSelectMode();
  currentParentId.value = id;
  const cached = childrenCache.get(id);
  if (cached) {
    applyList(cached);
    refresh(false); // 静默重新校验，确保数据最新
  } else {
    refresh();
  }
};

const isSelected = (id: string) => selectedIds.value.includes(id);

const enterSelectMode = (id?: string) => {
  selectMode.value = true;
  selectedIds.value = id ? [id] : [];
};

const exitSelectMode = () => {
  selectMode.value = false;
  selectedIds.value = [];
};

const toggleSelect = (id: string) => {
  if (isSelected(id)) {
    selectedIds.value = selectedIds.value.filter((item) => item !== id);
    return;
  }
  selectedIds.value = [...selectedIds.value, id];
};

let touchTimer: ReturnType<typeof setTimeout> | null = null;
let isLongPressTriggered = false;

const handleItemTouchStart = (item: DriveFileItem) => {
  isLongPressTriggered = false;
  if (touchTimer) clearTimeout(touchTimer);
  touchTimer = setTimeout(() => {
    isLongPressTriggered = true;
    if (!selectMode.value) enterSelectMode(item.id);
    else toggleSelect(item.id);
  }, 500);
};

const handleItemTouchEnd = () => {
  if (touchTimer) {
    clearTimeout(touchTimer);
    touchTimer = null;
  }
};

const handleItemClick = (item: DriveFileItem) => {
  if (isLongPressTriggered) {
    isLongPressTriggered = false;
    return;
  }
  if (selectMode.value) {
    toggleSelect(item.id);
    return;
  }
  if (item.kind === 'folder') {
    navigateTo(item.id);
  } else {
    openPreview(item);
  }
};

const openPreview = (item: DriveFileItem) => {
  previewItem.value = item;
  showPreview.value = true;
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
    case 'preview':
      openPreview(item);
      break;
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

// ==================== 桌面端右键上下文菜单 ====================

// 复用 actions（folder/file 分支），在最前追加「多选」项
const contextMenuActions = computed(() => {
  if (!contextItem.value) return [];
  return [{ name: '多选', action: 'multiselect' }, ...actions.value];
});

const openContextMenu = (e: MouseEvent, item: DriveFileItem) => {
  if (!isDesktop.value) return; // 仅桌面端
  e.preventDefault();
  actingItem.value = item; // 让 actions computed 正确返回 folder/file 分支
  contextItem.value = item;
  const menuW = 160;
  const menuH = contextMenuActions.value.length * 44 + 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = e.clientX;
  let y = e.clientY;
  if (x + menuW > vw - 8) x = e.clientX - menuW; // 超右边界向左展开
  if (y + menuH > vh - 8) y = e.clientY - menuH; // 超下边界向上展开
  if (x < 8) x = 8;
  if (y < 8) y = 8;
  contextMenu.value = { x, y };
};

const closeContextMenu = () => {
  contextMenu.value = null;
  contextItem.value = null;
};

const onContextMenuSelect = (action: any) => {
  const item = contextItem.value;
  closeContextMenu();
  if (!item) return;
  if (action.action === 'multiselect') {
    enterSelectMode(item.id);
    return;
  }
  onActionSelect(action);
};

const onContextMenuKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && contextMenu.value) closeContextMenu();
};
const onContextMenuScrollOrBlur = () => {
  if (contextMenu.value) closeContextMenu();
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
  shareTargets.value = [item];
  shareUrl.value = '';
  shareExpires.value = 86400;
  showShareDialog.value = true;
};

const openBatchShare = () => {
  const files = selectedFiles.value;
  const skipped = selectedItems.value.length - files.length;
  if (!files.length) {
    showToast('文件夹无法分享，请选择文件');
    return;
  }
  if (skipped) {
    showToast(`已跳过 ${skipped} 个文件夹`);
  }
  shareTargets.value = files;
  shareUrl.value = '';
  shareExpires.value = 86400;
  showShareDialog.value = true;
};

const handleShare = async () => {
  const targets = shareTargets.value.length ? shareTargets.value : (actingItem.value ? [actingItem.value] : []);
  if (!targets.length) return;
  generating.value = true;
  try {
    const urls: string[] = [];
    let failed = 0;
    for (const item of targets) {
      try {
        urls.push(await getShareUrl(item, shareExpires.value));
      } catch (e) {
        console.error('[Drive] share failed:', e);
        failed += 1;
      }
    }
    shareUrl.value = urls.join('\n');
    if (!urls.length) {
      showToast('生成分享链接失败');
    } else if (failed) {
      showToast(`已生成 ${urls.length} 条，失败 ${failed} 条`);
    }
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
    invalidateCache();
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
  movingItems.value = [item];
  moveBrowseId.value = currentParentId.value;
  await loadMoveFolder(moveBrowseId.value);
  showMoveDialog.value = true;
};

const openBatchMove = async () => {
  if (!selectedItems.value.length) {
    showToast('请先选择文件');
    return;
  }
  movingItems.value = [...selectedItems.value];
  moveBrowseId.value = currentParentId.value;
  await loadMoveFolder(moveBrowseId.value);
  showMoveDialog.value = true;
};

const loadMoveFolder = async (parentId: string) => {
  try {
    const result = await fetchDriveFiles(parentId);
    moveBreadcrumb.value = result.breadcrumb;
    const blocked = new Set(movingItems.value.filter((item) => item.kind === 'folder').map((item) => item.id));
    moveSubFolders.value = result.items.filter((v) => v.kind === 'folder' && !blocked.has(v.id));
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
  const targets = movingItems.value;
  if (!targets.length) return;
  submitting.value = true;
  try {
    let ok = 0;
    let failed = 0;
    for (const item of targets) {
      if ((item.parentId || '') === moveBrowseId.value) continue;
      if (isFolderBlockedDest(item)) {
        failed += 1;
        continue;
      }
      try {
        await moveDriveFile(item.id, moveBrowseId.value);
        ok += 1;
      } catch (e) {
        console.error('[Drive] move failed:', e);
        failed += 1;
      }
    }
    showMoveDialog.value = false;
    if (failed && ok) {
      showToast(`已移动 ${ok} 项，失败 ${failed} 项`);
    } else if (failed) {
      showToast('移动失败');
    } else {
      showToast('移动成功');
    }
    exitSelectMode();
    invalidateCache();
    await refresh(false);
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
      invalidateCache();
      await refresh(false);
    } catch (e) {
      console.error('[Drive] delete failed:', e);
      showToast('删除失败');
    }
  }).catch(() => {
    // 取消
  });
};

const handleBatchDelete = async () => {
  const targets = selectedItems.value;
  if (!targets.length) {
    showToast('请先选择文件');
    return;
  }
  const folderCount = targets.filter((item) => item.kind === 'folder').length;
  const message = folderCount
    ? `确定删除选中的 ${targets.length} 项吗？其中 ${folderCount} 个文件夹将连同内容一起删除。`
    : `确定删除选中的 ${targets.length} 个文件吗？`;
  try {
    await showConfirmDialog({ title: '删除', message });
  } catch {
    return;
  }
  let ok = 0;
  let failed = 0;
  for (const item of targets) {
    try {
      await deleteDriveFile(item.id);
      ok += 1;
    } catch (e) {
      console.error('[Drive] delete failed:', e);
      failed += 1;
    }
  }
  if (failed && ok) {
    showToast(`已删除 ${ok} 项，失败 ${failed} 项`);
  } else if (failed) {
    showToast('删除失败');
  } else {
    showToast('已删除');
  }
  exitSelectMode();
  invalidateCache();
  await refresh(false);
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
    invalidateCache();
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

const onFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length) return;
  uploadStore.enqueue(files, currentParentId.value);
};

const triggerUploadFolder = () => {
  if (folderUploading.value) return;
  folderInputRef.value?.click();
};

// 上传整个文件夹：解析 webkitRelativePath，串行创建不存在的目录，再入队上传文件
const uploadFolderFiles = async (files: File[], rootParentId: string) => {
  if (!files.length) return;
  // 每个文件携带 webkitRelativePath，形如 "TopDir/sub/file.txt"
  const annotated = files.map((file) => ({
    file,
    rel: file.webkitRelativePath || file.name,
  }));

  // 收集所有需要创建的目录路径（去掉顶层文件名段）
  const dirSet = new Set<string>();
  for (const { rel } of annotated) {
    const segs = rel.split('/').filter(Boolean);
    for (let i = 1; i < segs.length; i++) {
      dirSet.add(segs.slice(0, i).join('/'));
    }
  }
  // 按深度从浅到深排序，确保父目录先创建
  const dirs = [...dirSet].sort(
    (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b),
  );

  // 复用现有同名文件夹，避免重复创建
  const folderCache = new Map<string, string>(); // `${parentId}/${name}` -> folderId
  try {
    const seed = await fetchDriveFiles(rootParentId);
    for (const it of seed.items) {
      if (it.kind === 'folder') folderCache.set(`${rootParentId}/${it.name}`, it.id);
    }
  } catch (e) {
    console.warn('[Drive] seed folder list failed', e);
  }

  const ensureFolder = async (parentId: string, name: string): Promise<string | null> => {
    const key = `${parentId}/${name}`;
    const cached = folderCache.get(key);
    if (cached) return cached;
    try {
      const created = (await createFolder(name, parentId)) as DriveFileItem | undefined;
      const id = created?.id;
      if (!id) return null;
      folderCache.set(key, id);
      return id;
    } catch (e) {
      console.error('[Drive] create folder failed', e);
      return null;
    }
  };

  const pathToId = new Map<string, string>();
  let failedDirCount = 0;
  for (const path of dirs) {
    const segs = path.split('/');
    const parentPath = segs.slice(0, -1).join('/');
    const parentId = parentPath ? (pathToId.get(parentPath) ?? rootParentId) : rootParentId;
    const name = segs[segs.length - 1];
    const id = await ensureFolder(parentId, name);
    if (!id) {
      failedDirCount += 1;
      continue;
    }
    pathToId.set(path, id);
  }

  // 为每个文件确定所属目录 id 并入队
  const items: { file: File; parentId: string }[] = [];
  for (const { file, rel } of annotated) {
    const segs = rel.split('/').filter(Boolean);
    const dirPath = segs.slice(0, -1).join('/');
    const parentId = dirPath ? (pathToId.get(dirPath) ?? rootParentId) : rootParentId;
    items.push({ file, parentId });
  }

  if (items.length) {
    uploadStore.enqueueItems(items);
    showToast(
      `已开始上传 ${items.length} 个文件${failedDirCount ? `，${failedDirCount} 个目录创建失败` : ''}`,
    );
  } else {
    showToast('没有可上传的文件');
  }
};

const onFolderChange = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length) return;
  folderUploading.value = true;
  try {
    await uploadFolderFiles(files, currentParentId.value);
    invalidateCache();
    await refresh(false);
  } catch (e) {
    console.error('[Drive] upload folder failed:', e);
    showToast(e instanceof Error ? e.message : '上传文件夹失败');
  } finally {
    folderUploading.value = false;
  }
};

// ==================== 工具函数 ====================

const getIconByMime = (mime = '') => {
  if (mime.startsWith('image/')) return { name: 'photo-o', color: '#07c160' };
  if (mime.startsWith('video/')) return { name: 'video-o', color: '#1989fa' };
  if (mime.startsWith('audio/')) return { name: 'music-o', color: '#ff976a' };
  if (mime === 'application/pdf') return { name: 'description', color: '#ee0a24' };
  return { name: 'description', color: '#969799' };
};

const getIcon = (item?: DriveFileItem | null) => {
  if (!item) return { name: 'description', color: '#969799' };
  if (item.kind === 'folder') return { name: 'apps-o', color: '#ff976a' };
  return getIconByMime(item.mimeType);
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

  &.is-selecting {
    padding-bottom: calc(72px + env(safe-area-inset-bottom));
  }

  .nav-select,
  .nav-action,
  .nav-trash {
    font-size: 14px;
    color: var(--van-primary-color);
    cursor: pointer;
  }

  .nav-action,
  .nav-trash {
    margin-right: 16px;
  }

  :deep(.van-nav-bar__placeholder > .van-nav-bar--fixed) {
    padding-top: var(--safe-area-top);
  }

  // 右下角悬浮按钮组（上传文件 + 上传文件夹 + 新建文件夹），纵向排列
  .fab-group {
    position: fixed;
    right: 20px;
    bottom: calc(24px + env(safe-area-inset-bottom));
    z-index: 1;
    display: flex;
    flex-direction: column;
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

    &.is-busy {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .van-icon-spin {
    animation: van-icon-spin 1s linear infinite;
  }

  @keyframes van-icon-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
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

    &.is-selected {
      background: #f2f7ff;
    }

    .select-indicator {
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      border: 1.5px solid #c8c9cc;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      box-sizing: border-box;

      &.checked {
        border-color: var(--van-primary-color);
        background: var(--van-primary-color);
      }
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

      .upload-progress {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 6px;

        .progress-track {
          flex: 1;
          height: 4px;
          border-radius: 2px;
          background: #f2f3f5;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          border-radius: 2px;
          background: var(--van-primary-color);
          transition: width 0.2s ease;
        }
      }

      .upload-error {
        color: #ee0a24;
      }
    }
  }

  .file-item.is-upload {
    cursor: default;

    &:has(.upload-error) {
      cursor: pointer;
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

  // 桌面端右键上下文菜单
  .context-menu-mask {
    position: fixed;
    inset: 0;
    z-index: 10000;
  }

  .context-menu {
    position: fixed;
    z-index: 10001;
    min-width: 160px;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    padding: 4px 0;
    user-select: none;

    .context-menu-item {
      padding: 10px 16px;
      font-size: 14px;
      color: #323233;
      cursor: pointer;
      white-space: nowrap;

      &:hover {
        background: #f2f7ff;
      }

      &.is-danger {
        color: #ee0a24;
      }
    }
  }
}
</style>
