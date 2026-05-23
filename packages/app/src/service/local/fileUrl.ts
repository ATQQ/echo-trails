import { getBitifulConfigLocal } from '@/lib/bitifulConfig'
import SparkMD5 from 'spark-md5'

let bitifulConfigCache: Awaited<ReturnType<typeof getBitifulConfigLocal>> = null

async function getCachedBitifulConfig() {
  if (!bitifulConfigCache) {
    bitifulConfigCache = await getBitifulConfigLocal()
  }
  return bitifulConfigCache
}

export async function buildFileUrl(s3Key: string, style?: string, queryParams?: string): Promise<string> {
  if (!s3Key) return ''
  if (s3Key.startsWith('http') || s3Key.startsWith('/') || s3Key.startsWith('blob:')) return s3Key

  const config = await getCachedBitifulConfig()
  if (!config?.domain) return ''

  const base = config.domain.replace(/\/$/, '')
  const encodedParts = s3Key.split('/').map(p => encodeURIComponent(p)).join('/')
  const fileName = `/${encodedParts}` + (style ? `!style:${style}` : '')
  const fullKey = fileName + (queryParams ? `?${queryParams}` : '')

  if (config.cdnToken) {
    const deadLine = Math.floor(Date.now() / 1000) + 60 * 30
    const rawString = config.cdnToken + fileName + deadLine
    const md5Result = SparkMD5.hash(rawString)
    const separator = fullKey.includes('?') ? '&' : '?'
    return `${base}${fullKey}${separator}_btf_tk=${md5Result}&_ts=${deadLine}`
  }

  return `${base}${fullKey}`
}

export async function buildCoverUrl(s3Key: string, isImage = true): Promise<string> {
  const config = await getCachedBitifulConfig()
  const params = !isImage ? 'frame=0' : undefined
  const style = isImage ? config?.coverStyle : undefined
  return buildFileUrl(s3Key, style, params)
}

export async function buildPreviewUrl(s3Key: string, isImage = true): Promise<string> {
  const config = await getCachedBitifulConfig()
  const params = !isImage ? 'frame=0' : undefined
  const style = isImage ? config?.previewStyle : undefined
  return buildFileUrl(s3Key, style, params)
}

