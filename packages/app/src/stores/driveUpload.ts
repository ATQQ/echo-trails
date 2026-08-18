import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import pLimit from 'p-limit'
import { createDriveFile, type DriveFileItem } from '@/service/driveFile'
import { getUploadUrl, uploadFile } from '@/service'
import { randomUUID } from '@/lib/util'

export type DriveUploadStatus = 'pending' | 'uploading' | 'error'

export interface DriveUploadTask {
  id: string
  name: string
  size: number
  mimeType: string
  parentId: string
  progress: number
  status: DriveUploadStatus
  error?: string
  file: File
}

const limit = pLimit(2)

export const useDriveUploadStore = defineStore('driveUpload', () => {
  const tasks = ref<DriveUploadTask[]>([])
  const finishedItems = ref<DriveFileItem[]>([])
  const revision = ref(0)

  const pendingCount = computed(() =>
    tasks.value.filter((task) => task.status === 'pending' || task.status === 'uploading').length
  )

  const tasksFor = (parentId: string) =>
    tasks.value.filter((task) => task.parentId === parentId)

  const finishedFor = (parentId: string, existingIds: Set<string>) =>
    finishedItems.value.filter((item) => (item.parentId || '') === parentId && !existingIds.has(item.id))

  const pruneFinished = (serverItems: DriveFileItem[]) => {
    const ids = new Set(serverItems.map((item) => item.id))
    finishedItems.value = finishedItems.value.filter((item) => !ids.has(item.id))
  }

  const runUpload = async (task: DriveUploadTask) => {
    const current = tasks.value.find((item) => item.id === task.id)
    if (!current) return
    current.status = 'uploading'
    current.progress = 0
    current.error = undefined
    try {
      const key = `drive/${randomUUID()}/${current.name}`
      const uploadUrl = await getUploadUrl(key)
      await uploadFile(current.file, uploadUrl, (progress) => {
        const live = tasks.value.find((item) => item.id === current.id)
        if (live) live.progress = progress
      })
      const created = await createDriveFile({
        key,
        name: current.name,
        size: current.size,
        mimeType: current.mimeType,
        parentId: current.parentId,
      })
      tasks.value = tasks.value.filter((item) => item.id !== current.id)
      if (created?.id) {
        finishedItems.value = [created, ...finishedItems.value.filter((item) => item.id !== created.id)]
      }
      revision.value += 1
    } catch (e) {
      const live = tasks.value.find((item) => item.id === current.id)
      if (!live) return
      live.status = 'error'
      live.error = e instanceof Error ? e.message : '上传失败'
    }
  }

  const enqueueItems = (items: { file: File; parentId: string }[]) => {
    for (const { file, parentId } of items) {
      const task: DriveUploadTask = {
        id: randomUUID(),
        name: file.name.replace(/[\\/]/g, '_'),
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        parentId,
        progress: 0,
        status: 'pending',
        file,
      }
      tasks.value = [task, ...tasks.value]
      limit(() => runUpload(task))
    }
  }

  const enqueue = (files: File[], parentId: string) => {
    enqueueItems(files.map((file) => ({ file, parentId })))
  }

  const retry = (id: string) => {
    const task = tasks.value.find((item) => item.id === id)
    if (!task || task.status !== 'error') return
    task.status = 'pending'
    task.progress = 0
    task.error = undefined
    limit(() => runUpload(task))
  }

  const remove = (id: string) => {
    tasks.value = tasks.value.filter((item) => item.id !== id)
  }

  return {
    tasks,
    finishedItems,
    revision,
    pendingCount,
    tasksFor,
    finishedFor,
    pruneFinished,
    enqueue,
    enqueueItems,
    retry,
    remove,
  }
})
