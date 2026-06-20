<template>
  <div class="live-photo-layer">
    <div class="live-photo-video-wrap" :style="wrapStyle">
      <video
        ref="videoRef"
        class="live-photo-video"
        :class="{ 'is-playing': playing && isFrameReady }"
        :src="videoUrl"
        playsinline
        webkit-playsinline
        preload="auto"
        disablePictureInPicture
        @ended="handleEnded"
        @error="handleVideoError"
        @loadedmetadata="handleLoadedMetadata"
        @loadeddata="handleLoadedData"
        @playing="handlePlaying"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { livePhotoDebug } from '@/lib/livePhoto';

const props = withDefaults(defineProps<{
  videoUrl: string
  playing: boolean
  wrapStyle?: Record<string, string>
}>(), {
  wrapStyle: () => ({}),
})

const emit = defineEmits<{
  (e: 'ended'): void
}>()

const videoRef = ref<HTMLVideoElement>()
const isFrameReady = ref(false)

const stopVideo = () => {
  const video = videoRef.value
  if (!video) return
  isFrameReady.value = false
  try {
    video.pause()
    video.currentTime = 0
  } catch {
    // ignore
  }
}

const preloadVideo = () => {
  const video = videoRef.value
  if (!video || !props.videoUrl) return
  try {
    video.load()
  } catch {
    // ignore
  }
}

const waitForCanPlay = (video: HTMLVideoElement) => {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve()
  }
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('video preload timeout'))
    }, 8000)

    const cleanup = () => {
      window.clearTimeout(timeout)
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('error', onError)
    }

    const onReady = () => {
      cleanup()
      resolve()
    }

    const onError = () => {
      cleanup()
      reject(new Error('video preload failed'))
    }

    video.addEventListener('canplay', onReady, { once: true })
    video.addEventListener('loadeddata', onReady, { once: true })
    video.addEventListener('error', onError, { once: true })
  })
}

watch(() => props.videoUrl, () => {
  isFrameReady.value = false
  preloadVideo()
})

watch(() => props.playing, async (val) => {
  const video = videoRef.value
  if (!video || !props.videoUrl) return
  if (val) {
    try {
      isFrameReady.value = false
      await waitForCanPlay(video)
      video.currentTime = 0
      await video.play()
    } catch (e) {
      isFrameReady.value = false
      livePhotoDebug('preview.player.playFailed', {
        error: String(e),
        videoUrl: props.videoUrl?.slice(0, 80),
        readyState: video.readyState,
      })
      emit('ended')
    }
  } else {
    stopVideo()
  }
})

const handlePlaying = () => {
  isFrameReady.value = true
}

const handleLoadedData = () => {
  if (props.playing) {
    isFrameReady.value = true
  }
}

const handleEnded = () => {
  stopVideo()
  emit('ended')
}

const handleVideoError = () => {
  const video = videoRef.value
  isFrameReady.value = false
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
    readyState: video?.readyState,
  })
}

onMounted(() => {
  preloadVideo()
})

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
  overflow: hidden;
}

.live-photo-video-wrap {
  pointer-events: none;
}

.live-photo-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  opacity: 0;
  visibility: hidden;
  background: transparent;

  &.is-playing {
    opacity: 1;
    visibility: visible;
  }
}
</style>
