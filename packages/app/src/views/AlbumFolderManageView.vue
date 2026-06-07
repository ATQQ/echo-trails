<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageTitle from '@/components/PageTitle/PageTitle.vue'
import { getAlbums, getAlbumFolders, setAlbumFolder } from '@/service'
import { showToast } from 'vant'
import { notifyAlbumsChanged } from '@/lib/albumEvents'
import { preventBack } from '@/lib/router'

defineOptions({
  name: 'AlbumFolderManageView'
})

const route = useRoute()
const router = useRouter()
const folderId = computed(() => String(route.params.folderId || ''))

const folder = ref<AlbumFolder | null>(null)
const allAlbums = ref<Album[]>([])
const searchKeyword = ref('')
const loading = ref(false)
const saving = ref(false)

// 当前每个相册的 folderId 状态（用于取消勾选后回到原文件夹）
const initialFolderMap = ref<Record<string, string | null | undefined>>({})
// 正在显示的相册（按搜索词过滤）
const filteredAlbums = computed<Album[]>(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return allAlbums.value
  return allAlbums.value.filter(a => (a.name || '').toLowerCase().includes(keyword))
})

const loadData = async () => {
  loading.value = true
  try {
    const [albumsRes, folders] = await Promise.all([
      getAlbums(),
      getAlbumFolders(),
    ])
    const all = [
      ...(albumsRes.large || []),
      ...(albumsRes.small || [])
    ]
    allAlbums.value = all
    folder.value = folders.find(f => f._id === folderId.value) || null
    initialFolderMap.value = {}
    all.forEach(a => {
      initialFolderMap.value[a._id] = a.folderId ?? null
    })
  } catch (e) {
    console.error('Load folder manage data failed:', e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})

const handleToggle = (album: Album, checked: boolean) => {
  // 一个相册只能属于一个文件夹：勾选时把目标设为当前 folder，取消勾选时还原到原 folder
  if (checked) {
    album.folderId = folderId.value
  } else {
    album.folderId = initialFolderMap.value[album._id] ?? null
  }
}

const handleSave = async () => {
  saving.value = true
  try {
    // 计算差异：原状态 vs 当前状态
    const changes: { albumId: string, folderId: string | null }[] = []
    for (const album of allAlbums.value) {
      const before = initialFolderMap.value[album._id] ?? null
      const after = album.folderId ?? null
      if (before !== after) {
        changes.push({ albumId: album._id, folderId: after })
      }
    }
    if (changes.length === 0) {
      showToast('没有变化')
      router.go(-1)
      return
    }

    // 检查目标文件夹的有效性：所有非空的 folderId 都必须是当前 folderId（单选限制）
    for (const c of changes) {
      if (c.folderId && c.folderId !== folderId.value) {
        // 用户本意是仅修改本文件夹内相册；如果有冲突，回退到原值
        const album = allAlbums.value.find(a => a._id === c.albumId)
        if (album) {
          album.folderId = initialFolderMap.value[c.albumId] ?? null
        }
        c.folderId = initialFolderMap.value[c.albumId] ?? null
      }
    }

    for (const c of changes) {
      await setAlbumFolder(c.albumId, c.folderId)
    }
    showToast('已保存')
    notifyAlbumsChanged('album-folder-manage-view')
    router.go(-1)
  } catch (e: any) {
    showToast(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// 监听路由参数变化重新加载
watch(folderId, () => {
  loadData()
})
</script>

<template>
  <div class="app-wrapper">
    <PageTitle title="管理相册" :info="false" back>
      <template #action>
        <span class="save-btn" :class="{ disabled: saving }" @click="handleSave">{{ saving ? '保存中...' : '保存' }}</span>
      </template>
    </PageTitle>
    <div class="manage-content">
      <div v-if="folder" class="folder-tip">
        选择要加入「<b>{{ folder.name }}</b>」的相册
      </div>
      <van-search
        v-model="searchKeyword"
        class="album-search"
        shape="round"
        clearable
        placeholder="搜索相册名"
      />
      <div v-if="loading" class="loading-tip">加载中...</div>
      <van-empty v-else-if="!filteredAlbums.length" description="没有可管理的相册" />
      <van-cell-group v-else inset>
        <van-cell
          v-for="album in filteredAlbums"
          :key="album._id"
          :title="album.name"
          clickable
          center
          @click="handleToggle(album, (album.folderId !== folderId))"
        >
          <template #icon>
            <div class="album-cover">
              <img v-if="album.cover" :src="album.cover" alt="" />
              <div v-else class="cover-empty"></div>
            </div>
          </template>
          <template #label>
            <span class="album-meta">
              <span>{{ album.count }} 张</span>
              <span v-if="initialFolderMap[album._id] && initialFolderMap[album._id] !== folderId" class="in-other-folder">
                已归类
              </span>
            </span>
          </template>
          <template #right-icon>
            <van-checkbox
              :model-value="album.folderId === folderId"
              @update:model-value="(v: boolean) => handleToggle(album, v)"
            />
          </template>
        </van-cell>
      </van-cell-group>
    </div>
  </div>
</template>

<style scoped lang="scss">
.app-wrapper {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f7f8fa;
}
.manage-content {
  flex: 1;
  overflow-y: auto;
  padding-bottom: var(--footer-area-height);
}
.save-btn {
  font-size: 14px;
  color: #1989fa;
  margin-right: 12px;
  &.disabled {
    color: #969799;
  }
}
.folder-tip {
  padding: 12px 16px 4px;
  font-size: 14px;
  color: #666;
  b {
    color: #333;
  }
}
.album-search {
  padding: 8px 12px;
  background: transparent;
}
.loading-tip {
  padding: 40px 0;
  text-align: center;
  color: #969799;
  font-size: 14px;
}
.album-cover {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  margin-right: 12px;
  overflow: hidden;
  background: #f2f3f5;
  flex-shrink: 0;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .cover-empty {
    width: 100%;
    height: 100%;
  }
}
.album-meta {
  font-size: 12px;
  color: #969799;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.in-other-folder {
  background: #fff7e8;
  color: #ff976a;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
}
</style>
