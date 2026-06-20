<template>
  <div class="live-photo-layer">
    <video
      v-show="playing"
      ref="videoRef"
      class="live-photo-video"
      :src="videoUrl"
      muted
      playsinline
      webkit-playsinline
      preload="metadata"
      @ended="handleEnded"
      @error="handleVideoError"
      @loadedmetadata="handleLoadedMetadata"
    />
    <div v-if="showBadge" class="live-photo-badge">
      <span class="dot" :class="{ active: playing }"></span>
      LIVE
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { livePhotoDebug } from '@/lib/livePhoto';

const props = withDefaults(defineProps<{
  videoUrl: string
  playing: boolean
  showBadge?: boolean
}>(), {
  showBadge: true,
})

const emit = defineEmits<{
  (e: 'ended'): void
}>()

const videoRef = ref<HTMLVideoElement>()

const stopVideo = () => {
  const video = videoRef.value
  if (!video) return
  try {
    video.pause()
    video.currentTime = 0
  } catch {
    // ignore
  }
}

watch(() => props.videoUrl, (url) => {
  const video = videoRef.value
  if (!video || !url) return
  video.load()
})

watch(() => props.playing, async (val) => {
  const video = videoRef.value
  if (!video || !props.videoUrl) return
  if (val) {
    try {
      video.currentTime = 0
      await video.play()
    } catch (e) {
      livePhotoDebug('preview.player.playFailed', { error: String(e), videoUrl: props.videoUrl?.slice(0, 80) })
    }
  } else {
    stopVideo()
  }
})

const handleEnded = () => {
  stopVideo()
  emit('ended')
}

const handleVideoError = () => {
  const video = videoRef.value
  livePhotoDebug('preview.player.error', {
    videoUrl: props.videoUrl?.slice(0, 80),
    networkState: video?.networkState,
    readyState: video?.readyState,
    error: video?.error?.code,
  })
}

const handleLoadedMetadata = () => {
  const video = videoRef.value
  livePhotoDebug('preview.player.ready', {
    duration: video?.duration,
    videoUrl: props.videoUrl?.slice(0, 80),
  })
}

onBeforeUnmount(() => {
  stopVideo()
})
</script>

<style lang="scss" scoped>
.live-photo-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

.live-photo-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.live-photo-badge {
  position: absolute;
  top: env(safe-area-inset-top, 0);
  left: 12px;
  margin-top: 12px;
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 5;
  backdrop-filter: blur(4px);

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #fff;
    opacity: 0.7;

    &.active {
      background: #ff3b30;
      opacity: 1;
      box-shadow: 0 0 6px rgba(255, 59, 48, 0.8);
    }
  }
}
</style>
