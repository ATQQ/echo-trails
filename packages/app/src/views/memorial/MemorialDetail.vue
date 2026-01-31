<template>
  <div class="memorial-detail" :style="bgStyle" ref="detailRef">
    <div class="overlay"></div>

    <div class="nav-bar" v-show="showControls">
        <van-icon name="arrow-left" color="#fff" size="24" @click="$emit('close')" />
        <div class="actions">
            <van-popover v-model:show="showPopover" :actions="actions" @select="onSelect" placement="bottom-end">
                <template #reference>
                    <van-icon name="ellipsis" color="#fff" size="24" />
                </template>
            </van-popover>
        </div>
    </div>

    <div class="content" @click="toggleControls">
        <div class="title">{{ item.displayTitle || item.name }}</div>

        <div class="counter">
            <div class="label-top" v-if="item.endDate">{{ getLabel(item) }}</div>
            <span class="number">{{ days }}</span>
            <span class="unit">天</span>
        </div>

        <div class="date-info">
            <div class="label">起始日期 {{ formatDate(item.date) }} {{ getWeekDay(item.date) }}</div>
            <div class="label" v-if="item.endDate">结束日期 {{ formatDate(item.endDate) }} {{ getWeekDay(item.endDate) }}</div>
            <div class="progress-section" v-if="item.endDate">
                <van-progress :percentage="getProgress(item)" :stroke-width="6" :show-pivot="false" color="#fff" track-color="rgba(255,255,255,0.3)" />
                <div class="progress-text">进度 {{ getProgress(item) }}%</div>
            </div>
            <div class="description" v-if="item.description">{{ item.description }}</div>
        </div>
    </div>

    <div class="footer-actions" v-show="showControls">
        <div class="action-btn" @click="$emit('edit', item)">
            <van-icon name="edit" />
            <span>编辑</span>
        </div>
        <div class="action-btn" @click="showCoverSelector = true">
            <van-icon name="photo-o" />
            <span>换封面</span>
        </div>
    </div>

    <!-- Cover Selector Popup -->
    <van-popup
        v-model:show="showCoverSelector"
        position="bottom"
        round
        :style="{ height: '50%' }"
    >
        <div class="cover-selector-popup">
            <div class="popup-title">更换封面</div>

            <div class="custom-upload-section" @click="onChangeCover">
                <div class="upload-icon-box">
                    <van-icon name="photograph" />
                </div>
                <div class="upload-text">从相册选择</div>
            </div>

            <div class="preset-title">推荐封面</div>
            <div class="preset-grid">
                <div
                    v-for="url in presetCovers"
                    :key="url"
                    class="preset-item"
                    @click="onSelectPreset(url)"
                >
                    <van-image :src="url" width="100%" height="80" fit="cover" radius="8" />
                </div>
            </div>
        </div>
    </van-popup>

    <!-- Hidden File Input -->
    <input
        type="file"
        ref="fileInput"
        style="display: none"
        accept="image/*"
        @change="onFileSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useMemorialStore, type MemorialDay } from '@/stores/memorial';
import { useMemorialCalc } from '@/composables/useMemorialCalc';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { snapdom } from '@zumer/snapdom';
import { downloadFile, ensureUploadInfo } from '@/lib/file';
import { showToast, showLoadingToast, closeToast } from 'vant';
import { getUploadUrl, uploadFile } from '@/service';
import { isTauri } from '@/constants';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { parseNativeImageFileUploadInfo } from '@/lib/file';
import { storeToRefs } from 'pinia';

dayjs.locale('zh-cn');

const props = defineProps<{
    item: MemorialDay
}>();

const emit = defineEmits(['close', 'edit', 'update']);

const store = useMemorialStore();
const { presetCovers } = storeToRefs(store);
const { getDays, getLabel, getProgress, formatDate } = useMemorialCalc();

const showPopover = ref(false);
const showControls = ref(true);
const showCoverSelector = ref(false);
const detailRef = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const actions = [
  { text: '编辑', icon: 'edit' },
  { text: '分享', icon: 'share-o' },
];

const days = computed(() => getDays(props.item));

const bgStyle = computed(() => {
    if (props.item.coverImage) {
        return {
            backgroundImage: `url(${props.item.coverImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
        };
    }
    return {
        background: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)'
    };
});

const getWeekDay = (date: string) => {
    return dayjs(date).format('dddd');
};

const toggleControls = () => {
    showControls.value = !showControls.value;
};

const onSelect = (action: any) => {
    if (action.text === '编辑') {
        emit('edit', props.item);
    } else if (action.text === '分享') {
        handleShare();
    }
};

const handleShare = async () => {
    if (!detailRef.value) return;

    // Temporarily hide controls if they are showing
    const controlsWereShowing = showControls.value;
    if (controlsWereShowing) {
        showControls.value = false;
        // Wait for DOM update
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    try {
        showLoadingToast({ message: '生成图片中...', forbidClick: true });

        // Use type: 'png' to ensure we get a raster image blob, not the default SVG blob
        const blob = await snapdom.toBlob(detailRef.value, { type: 'png', scale: 2 });
        const fileName = `memorial-${props.item.name}-${Date.now()}.png`;

        await downloadFile(blob, fileName, true);

        showToast('保存成功');
    } catch (e) {
        console.error('Share failed:', e);
        showToast('分享失败');
    } finally {
        closeToast();
        // Restore controls
        if (controlsWereShowing) {
            showControls.value = true;
        }
    }
};

// --- Change Cover Logic ---

const onChangeCover = async () => {
    showCoverSelector.value = false; // Close popup first
    if (isTauri) {
        const selected = await open({
            multiple: false,
            filters: [{
                name: 'Image',
                extensions: ['png', 'jpeg', 'webp', 'gif']
            }]
        });

        if (selected) {
            const filePath = selected as string;
            const fileInfo = await parseNativeImageFileUploadInfo(filePath);
            if (fileInfo) {
                (fileInfo as any).filePath = filePath;
                uploadAndSave(fileInfo);
            } else {
                showToast('解析文件失败');
            }
        }
    } else {
        fileInput.value?.click();
    }
};

const onSelectPreset = async (url: string) => {
    showCoverSelector.value = false;
    try {
        showLoadingToast({ message: '更换中...', forbidClick: true });
        await store.updateMemorial(props.item.id, { coverImage: url });
        emit('update', { ...props.item, coverImage: url });
        showToast('更换成功');
    } catch (e) {
        showToast('更换失败');
    } finally {
        closeToast();
    }
};

const onFileSelected = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
        const rawFile = input.files[0];
        const fileInfo = {
            file: rawFile,
            name: rawFile.name,
            lastModified: rawFile.lastModified,
            date: new Date(rawFile.lastModified),
            objectUrl: URL.createObjectURL(rawFile)
        };
        await ensureUploadInfo(fileInfo as any);
        uploadAndSave(fileInfo as any);
    }
    // Reset input
    if (input) input.value = '';
};

const generateAssetKey = (fileInfo: any) => {
  const year = fileInfo.date.getFullYear();
  const month = (fileInfo.date.getMonth() + 1).toString().padStart(2, '0');
  const day = fileInfo.date.getDate().toString().padStart(2, '0');
  const hour = fileInfo.date.getHours().toString().padStart(2, '0');
  const minute = fileInfo.date.getMinutes().toString().padStart(2, '0');
  const second = fileInfo.date.getSeconds().toString().padStart(2, '0');
  const uploadTime = new Date().getTime()
  const { operator = 'unknow', username = 'unknow' } = JSON.parse(localStorage.getItem('userInfo') || '{}')

  const keySuffix = `${username}/${operator}/${year}-${month}-${day}/${hour}-${minute}-${second}-${uploadTime}-${fileInfo.name}`
  return `memorial/${keySuffix}`
};

const uploadAndSave = async (fileInfo: any) => {
    try {
        showLoadingToast({ message: '上传封面中...', forbidClick: true });

        const key = generateAssetKey(fileInfo);
        const uploadUrl = await getUploadUrl(key);

        if (isTauri && fileInfo.filePath) {
             await invoke('upload_file', {
                key: key,
                path: fileInfo.filePath,
                url: uploadUrl
             });
        } else {
             await uploadFile(fileInfo.file, uploadUrl);
        }

        const cdn = import.meta.env.VITE_BITIFUL_CDN || '';
        const fullUrl = `${cdn}/${key}`;

        await store.updateMemorial(props.item.id, { coverImage: fullUrl });
        emit('update', { ...props.item, coverImage: fullUrl });

        showToast('更换成功');

    } catch (e) {
        console.error(e);
        showToast('上传失败');
    } finally {
        closeToast();
    }
};

</script>

<style scoped lang="scss">
.memorial-detail {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    color: #fff;
    overflow: hidden;

    .overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.3);
        z-index: 0;
    }

    .nav-bar {
        position: relative;
        z-index: 10;
        display: flex;
        justify-content: space-between;
        padding: var(--safe-area-top) 16px 10px;
        align-items: center;
        height: 44px;
        box-sizing: content-box;
    }

    .content {
        position: relative;
        z-index: 10;
        text-align: center;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding-bottom: 100px;

        .title {
            font-size: 20px;
            margin-bottom: 20px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
            letter-spacing: 1px;
        }

        .counter {
            margin-bottom: 30px;
            .label-top {
                font-size: 16px;
                margin-bottom: 10px;
                opacity: 0.9;
            }
            .number {
                font-size: 80px;
                font-weight: bold;
                line-height: 1;
                font-family: 'Helvetica Neue', sans-serif;
                text-shadow: 0 4px 10px rgba(0,0,0,0.3);
            }
            .unit {
                font-size: 16px;
                margin-left: 8px;
                font-weight: normal;
                vertical-align: super;
                background: #ff4d4f;
                padding: 2px 6px;
                border-radius: 4px;
            }
        }

        .date-info {
            width: 100%;
            padding: 0 20px;
            box-sizing: border-box;

            .label {
                font-size: 14px;
                opacity: 0.9;
                margin-bottom: 8px;
            }
            .progress-section {
                margin: 20px auto;
                width: 80%;

                .progress-text {
                    margin-top: 8px;
                    font-size: 12px;
                    opacity: 0.8;
                }
            }
            .description {
                font-size: 16px;
                opacity: 1;
                margin-top: 16px;
                max-width: 80%;
                margin-left: auto;
                margin-right: auto;
            }
        }
    }

    .footer-actions {
        position: relative;
        z-index: 10;
        display: flex;
        justify-content: space-around;
        padding-bottom: calc(20px + var(--safe-area-bottom));

        .action-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            font-size: 12px;
            opacity: 0.9;

            .van-icon {
                font-size: 24px;
                margin-bottom: 4px;
            }
        }
    }
}

.cover-selector-popup {
    padding: 20px;
    height: 100%;
    display: flex;
    flex-direction: column;

    .popup-title {
        font-size: 16px;
        font-weight: bold;
        text-align: center;
        margin-bottom: 20px;
    }

    .custom-upload-section {
        display: flex;
        align-items: center;
        padding: 12px;
        background: #f7f8fa;
        border-radius: 8px;
        margin-bottom: 20px;

        .upload-icon-box {
            width: 40px;
            height: 40px;
            background: #fff;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 12px;

            .van-icon {
                font-size: 20px;
                color: #333;
            }
        }

        .upload-text {
            font-size: 14px;
            color: #333;
        }
    }

    .preset-title {
        font-size: 14px;
        font-weight: bold;
        margin-bottom: 12px;
    }

    .preset-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        overflow-y: auto;
        padding-bottom: 20px;

        .preset-item {
            aspect-ratio: 16/9;
        }
    }
}
</style>
