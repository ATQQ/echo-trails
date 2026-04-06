<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { isTauri } from '@/constants';
import { BaseDirectory, lstat, remove  } from '@tauri-apps/plugin-fs';
import { MEMORY_CACHE_STORAGE_KEY } from '@/composables/useCachedImage';
import { preventBack } from '@/lib/router';

const router = useRouter();

interface CacheItem {
  key: string;
  size: number;
  sizeStr: string;
}

interface CacheCategory {
  id: string;
  name: string;
  desc: string;
  danger: boolean;
  items: CacheItem[];
  totalSize: number;
  totalSizeStr: string;
}

interface ImageCacheItem {
  key: string;
  path: string;
  src: string;
  size: number;
  sizeStr: string;
  mtime: number;
}

const imageCaches = ref<ImageCacheItem[]>([]);
const totalImageSize = ref(0);
const totalImageSizeStr = ref('0 B');
const showClearSheet = ref(false);
preventBack(showClearSheet);

const clearActions = [
  { name: '清理全部', subname: '释放所有图片缓存空间', value: 'all' },
  { name: '清理大尺寸图片', subname: '清理大于 1MB 的图片', value: 'large' },
  { name: '清理旧缓存', subname: '保留最新 200 张，清理其它较旧图片', value: 'old' }
];

const onSelectClearAction = (action: { name: string, value: string }) => {
  showClearSheet.value = false;
  let itemsToDelete: ImageCacheItem[] = [];

  if (action.value === 'all') {
    itemsToDelete = imageCaches.value;
  } else if (action.value === 'large') {
    itemsToDelete = imageCaches.value.filter(img => img.size > 1024 * 1024);
  } else if (action.value === 'old') {
    // Sort by mtime descending (newest first)
    const sorted = [...imageCaches.value].sort((a, b) => b.mtime - a.mtime);
    itemsToDelete = sorted.slice(200); // Keep first 200, delete the rest
  }

  if (itemsToDelete.length === 0) {
    showToast('没有符合条件的图片可清理');
    return;
  }

  const totalFreedSize = itemsToDelete.reduce((acc, img) => acc + img.size, 0);

  showConfirmDialog({
    title: '确认清理',
    message: `【${action.name}】将清理 ${itemsToDelete.length} 张图片，共释放 ${formatSize(totalFreedSize)} 空间，确定继续吗？`,
    confirmButtonColor: '#ee0a24',
  }).then(() => {
    deleteImageCaches(itemsToDelete);
  }).catch(() => {});
};

const categories = ref<CacheCategory[]>([
  {
    id: 'auth',
    name: '身份认证',
    desc: '包含登录凭证和用户基本信息。清理后需要重新登录。',
    danger: true,
    items: [],
    totalSize: 0,
    totalSizeStr: '0 B'
  },
  {
    id: 'config',
    name: '系统配置',
    desc: '包含服务器地址、存储配置等。清理后应用可能会重置为默认状态。',
    danger: true,
    items: [],
    totalSize: 0,
    totalSizeStr: '0 B'
  },
  {
    id: 'preference',
    name: '用户偏好',
    desc: '包含导航栏菜单、默认展示单位等个人习惯设置。',
    danger: false,
    items: [],
    totalSize: 0,
    totalSizeStr: '0 B'
  },
  {
    id: 'data',
    name: '业务数据缓存',
    desc: '包含相册列表、图片内存映射等临时数据。清理可释放空间，重新加载时会重新获取。',
    danger: false,
    items: [],
    totalSize: 0,
    totalSizeStr: '0 B'
  },
  {
    id: 'other',
    name: '其他缓存',
    desc: '未分类的其他本地数据。',
    danger: false,
    items: [],
    totalSize: 0,
    totalSizeStr: '0 B'
  }
]);

const authKeys = ['token', 'userInfo', 'currentPerson'];
const configKeys = ['config', 'bitiful-config'];
const prefKeys = ['bp_current_family', 'weight_current_family', 'album_sort_type', 'weight-kg', 'footer_menus'];

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getCategoryForKey = (key: string) => {
  if (authKeys.includes(key)) return 'auth';
  if (configKeys.includes(key)) return 'config';
  if (prefKeys.includes(key)) return 'preference';

  // Data cache heuristics
  if (
    key === MEMORY_CACHE_STORAGE_KEY ||
    key === 'albumList' ||
    key.startsWith('album_info_') ||
    key.startsWith('photo_list_cache') ||
    key.includes('list') ||
    key.includes('cache')
  ) {
    return 'data';
  }

  return 'other';
};

const isCalculatingImages = ref(false);
const imageCacheCalculated = ref(false);

const loadCaches = () => {
  // Reset items
  categories.value.forEach(c => {
    c.items = [];
    c.totalSize = 0;
  });

  let totalAppSize = 0;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    const value = localStorage.getItem(key) || '';
    // UTF-16 character is 2 bytes
    const size = key.length * 2 + value.length * 2;
    totalAppSize += size;

    const categoryId = getCategoryForKey(key);
    const category = categories.value.find(c => c.id === categoryId);

    if (category) {
      category.items.push({
        key,
        size,
        sizeStr: formatSize(size)
      });
      category.totalSize += size;
    }
  }

  // Update total sizes strings
  categories.value.forEach(c => {
    c.totalSizeStr = formatSize(c.totalSize);
    // Sort items by size descending
    c.items.sort((a, b) => b.size - a.size);
  });
};

const calculateImageCache = async () => {
  if (!isTauri) return;

  isCalculatingImages.value = true;

  try {
    const memoryCacheStr = localStorage.getItem(MEMORY_CACHE_STORAGE_KEY);
    if (memoryCacheStr) {
      const memoryCache = JSON.parse(memoryCacheStr);

      let sumSize = 0;
      const tempImageCaches: ImageCacheItem[] = [];

      // Parse valid caches
      for (const [key, src] of Object.entries(memoryCache)) {
         if (typeof src === 'string' && src.includes('image_cache')) {
            const parts = decodeURIComponent(src).split('image_cache/');
            if (parts.length > 1) {
               const relPath = `image_cache/${parts[1]}`;
               try {
                 const stat = await lstat(relPath, { baseDir: BaseDirectory.AppCache });
                 if (stat && stat.size) {
                    sumSize += stat.size;
                    tempImageCaches.push({
                      key,
                      path: relPath,
                      src,
                      size: stat.size,
                      sizeStr: formatSize(stat.size),
                      mtime: stat.mtime ? new Date(stat.mtime).getTime() : 0
                    });
                 }
               } catch (e) {
                 // File might have been deleted, ignore
               }
            }
         }
      }

      // Sort by size
      tempImageCaches.sort((a, b) => b.size - a.size);
      imageCaches.value = tempImageCaches;
      totalImageSize.value = sumSize;
      totalImageSizeStr.value = formatSize(sumSize);
    }

    imageCacheCalculated.value = true;
  } catch (e) {
    console.error('Failed to calculate physical image cache size', e);
    showToast('计算图片缓存失败');
  } finally {
    isCalculatingImages.value = false;
  }
};

onMounted(() => {
  loadCaches();
});

const activeNames = ref<string[]>([]);

const goBack = () => {
  router.back();
};

const handleClearCategory = (category: CacheCategory) => {
  if (category.items.length === 0) {
    showToast('该分类下没有缓存数据');
    return;
  }

  showConfirmDialog({
    title: '确认清理',
    message: category.danger
      ? `清理【${category.name}】可能会导致退出登录或配置丢失，确定要清理吗？`
      : `确定要清理【${category.name}】的缓存数据吗？`,
    confirmButtonColor: category.danger ? '#ee0a24' : '#1989fa',
  }).then(() => {
    category.items.forEach(item => {
      localStorage.removeItem(item.key);
    });
    showToast('清理成功');

    // Special handling for auth
    if (category.id === 'auth') {
      setTimeout(() => {
        window.location.href = '/login';
      }, 500);
    } else if (category.id === 'config') {
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } else {
      loadCaches();
    }
  }).catch(() => {
    // on cancel
  });
};

const handleClearItem = (item: CacheItem, category: CacheCategory) => {
  showConfirmDialog({
    title: '确认清理',
    message: `确定要清理【${item.key}】吗？`,
  }).then(() => {
    localStorage.removeItem(item.key);
    showToast('清理成功');
    loadCaches();
  }).catch(() => {
    // on cancel
  });
};

const deleteImageCaches = async (items: ImageCacheItem[]) => {
  if (!items.length) return;

  const memoryCacheStr = localStorage.getItem(MEMORY_CACHE_STORAGE_KEY);
  const memoryCache = memoryCacheStr ? JSON.parse(memoryCacheStr) : {};

  let deletedCount = 0;
  for (const item of items) {
    try {
      await remove(item.path, { baseDir: BaseDirectory.AppCache });
      delete memoryCache[item.key];
      deletedCount++;
    } catch (e) {
      console.error(`Failed to delete ${item.path}`, e);
      // Still remove from memory map if physical deletion fails (might be already gone)
      delete memoryCache[item.key];
    }
  }

  // Update memory cache
  localStorage.setItem(MEMORY_CACHE_STORAGE_KEY, JSON.stringify(memoryCache));

  // Clear selection if any logic still uses it
  showToast(`成功清理 ${deletedCount} 张图片缓存`);

  // Re-calculate stats instead of full page load
  calculateImageCache();
};

const clearAllSafe = () => {
  const safeCategories = categories.value.filter(c => !c.danger);
  const totalSafeItems = safeCategories.reduce((acc, c) => acc + c.items.length, 0);

  if (totalSafeItems === 0) {
    showToast('暂无可清理的普通缓存');
    return;
  }

  showConfirmDialog({
    title: '一键清理',
    message: '确定要清理所有业务数据、用户偏好和其他缓存吗？（身份认证和系统配置将被保留）',
  }).then(() => {
    safeCategories.forEach(c => {
      c.items.forEach(item => {
        localStorage.removeItem(item.key);
      });
    });
    showToast('一键清理成功');
    loadCaches();
  }).catch(() => {});
};

</script>

<template>
  <div class="cache-manage-container">
    <van-nav-bar
      title="缓存管理"
      left-text="返回"
      left-arrow
      @click-left="goBack"
      placeholder
      class="safe-padding-top"
    />

    <div class="content">
      <div class="summary-section">
        <van-button type="primary" block round @click="clearAllSafe">
          一键清理无风险缓存
        </van-button>
        <p class="tips">一键清理将保留您的登录状态和系统配置</p>
      </div>

      <div v-for="category in categories" :key="category.id" class="category-block">
        <template v-if="category.items.length > 0">
          <van-cell-group :title="`${category.name} (${category.totalSizeStr})`" inset>
            <template #title>
              <div class="group-title">
                <span>{{ category.name }} <span class="size-tag">{{ category.totalSizeStr }}</span></span>
                <van-button size="mini" :type="category.danger ? 'danger' : 'primary'" plain @click="handleClearCategory(category)">
                  清理整类
                </van-button>
              </div>
              <div class="group-desc">{{ category.desc }}</div>
            </template>

            <van-collapse v-model="activeNames">
              <van-collapse-item title="查看详情" :name="category.id">
                <template v-for="item in category.items" :key="item.key">
                  <van-cell
                    :value="item.sizeStr"
                    :label="`占用空间`"
                  >
                    <template #title>
                      <div class="item-key">{{ item.key }}</div>
                    </template>
                    <template #right-icon>
                      <van-icon name="delete-o" class="delete-icon" @click.stop="handleClearItem(item, category)" />
                    </template>
                  </van-cell>
                </template>
              </van-collapse-item>
            </van-collapse>
          </van-cell-group>
        </template>
      </div>

      <!-- Dedicated Image Cache Section for Tauri -->
      <div v-if="isTauri" class="category-block">
        <van-cell-group inset>
          <template #title>
            <div class="group-title">
              <span>本地缓存图片 <span v-if="imageCacheCalculated" class="size-tag">{{ totalImageSizeStr }}</span></span>
              <div>
                <van-button
                  v-if="!imageCacheCalculated"
                  size="mini"
                  type="primary"
                  :loading="isCalculatingImages"
                  @click="calculateImageCache"
                >
                  点击计算
                </van-button>
                <template v-else-if="imageCaches.length > 0">
                  <van-button size="mini" type="danger" plain @click="showClearSheet = true">
                    清理选项
                  </van-button>
                </template>
              </div>
            </div>
            <div class="group-desc">浏览应用时自动缓存的图片文件，清理后可释放大量存储空间。</div>
          </template>
        </van-cell-group>
      </div>
    </div>

    <van-action-sheet
      v-model:show="showClearSheet"
      :actions="clearActions"
      cancel-text="取消"
      description="选择清理策略"
      @select="onSelectClearAction"
      class="safe-padding-bottom"
    />
  </div>
</template>

<style scoped lang="scss">
.cache-manage-container {
  min-height: 100vh;
  box-sizing: border-box;
  background-color: #f7f8fa;
}

.content {
  padding-top: 16px;
  padding-bottom: 40px;
}

.summary-section {
  padding: 0 16px 16px;

  .tips {
    font-size: 12px;
    color: #969799;
    text-align: center;
    margin-top: 8px;
    margin-bottom: 0;
  }
}

.category-block {
  margin-bottom: 16px;
}

.group-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #323233;
  font-size: 14px;
  font-weight: bold;

  .size-tag {
    font-weight: normal;
    color: #969799;
    font-size: 12px;
    margin-left: 4px;
  }
}

.group-desc {
  font-size: 12px;
  color: #969799;
  margin-top: 4px;
  line-height: 1.4;
}

.delete-icon {
  font-size: 18px;
  color: #ee0a24;
  margin-left: 8px;
  display: flex;
  align-items: center;
  padding: 4px;
  cursor: pointer;

  &:active {
    opacity: 0.7;
  }
}

:deep(.van-collapse-item__content) {
  padding: 0;
}

.item-key {
  word-break: break-all;
  white-space: normal;
  line-height: 1.4;
  font-size: 13px;
  color: #323233;
}

</style>
