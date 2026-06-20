<template>
  <div class="live-photo-layer">
    <video
      v-show="playing"
      ref="videoRef"
      class="live-photo-video"
      :src="videoUrl"
      playsinline
      webkit-playsinline
      preload="metadata"
      @ended="handleEnded"
      @error="handleVideoError"
      @loadedmetadata="handleLoadedMetadata"
    />
  </div>
</template>

<script lang="ts" setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { livePhotoDebug } from '@/lib/livePhoto';

const props = defineProps<{
  videoUrl: string
  playing: boolean
}>()

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
</style>
