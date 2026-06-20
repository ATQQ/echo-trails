export function isCompleteLivePhoto(
  photo: Pick<Photo, 'isLive' | 'liveVideoKey' | 'liveVideoUrl'> | null | undefined
): boolean {
  if (!photo?.isLive) return false
  return !!(photo.liveVideoKey || photo.liveVideoUrl)
}

/** 调试日志，过滤关键字: LivePhoto:DEBUG */
export function livePhotoDebug(step: string, data?: Record<string, unknown>) {
  const payload = data ? JSON.stringify(data, (_, v) => {
    if (v instanceof File) return { name: v.name, size: v.size, type: v.type }
    if (v instanceof Blob) return { size: v.size, type: v.type }
    return v
  }) : ''
  console.log(`[LivePhoto:DEBUG] ${step}${payload ? ` ${payload}` : ''}`)
}
