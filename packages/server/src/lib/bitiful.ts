import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const s3Client = new S3Client({
  endpoint: "https://s3.bitiful.net",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  region: 'ap-northeast-1'
});

export async function createFileLink(key: string, style?: string) {
  const Key = style ? `${key}!style:${style}` : key
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key,
  })
  // TODO: 添加缓存，避免频繁构造请求，缓存失效
  return getSignedUrl(s3Client, command, { expiresIn: 60 * 30 /*半小时*/ })
}

export async function createCoverLink(key: string) {
  return createFileLink(key, process.env.BITIFUL_COVER_STYLE)
}

export async function createPreviewLink(key: string) {
  return createFileLink(key, process.env.BITIFUL_PREVIEW_STTYLE)
}

export async function createAlbumLink(key: string) {
  return createFileLink(key, process.env.BITIFUL_ALBUM_STYLE)
}
