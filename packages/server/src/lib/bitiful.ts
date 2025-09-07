import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Store } from './store';

export const bitifulConfig = {
  accessKey: process.env.S3_ACCESS_KEY,
  secretKey: process.env.S3_SECRET_KEY,
  bucket: process.env.S3_BUCKET,
  domain: process.env.S3_DOMAIN,
  coverStyle: process.env.BITIFUL_COVER_STYLE,
  previewStyle: process.env.BITIFUL_PREVIEW_STTYLE,
  albumStyle: process.env.BITIFUL_ALBUM_STYLE,
  region: process.env.S3_REGION ||  'cn-east-1',
}

export function refreshBitifulConfig(v: Partial<typeof bitifulConfig>) {
  // 提取非空的值
  const notNullKeys = Object.fromEntries(
    Object.entries(v).filter(([_, v]) => !!v)
  )
  Object.assign(bitifulConfig, notNullKeys)
}

class BitifulS3Manager {
  private s3Client: S3Client;

  constructor() {
    this.s3Client = this.createS3Client();
  }

  private createS3Client(): S3Client {
    return new S3Client({
      endpoint: "https://s3.bitiful.net",
      credentials: {
        accessKeyId: bitifulConfig.accessKey,
        secretAccessKey: bitifulConfig.secretKey,
      },
      region: bitifulConfig.region,
    });
  }

  public refreshClient(): void {
    this.s3Client = this.createS3Client();
    urlStore.clear()
  }

  public getClient(): S3Client {
    return this.s3Client;
  }
}

export const bitifulS3Manager = new BitifulS3Manager();

const urlStore = new Store()

export async function createFileLink(key: string, style?: string) {
  const Key = style ? `${key}!style:${style}` : key
  if (urlStore.has(Key)) {
    return urlStore.get(Key)
  }

  const command = new GetObjectCommand({
    Bucket: bitifulConfig.bucket,
    Key,
  })

  // 添加缓存，避免频繁构造请求，缓存失效
  const url = await getSignedUrl(bitifulS3Manager.getClient(), command, { expiresIn: 60 * 30 /*半小时*/ })
  urlStore.set(Key, url, 1000 * 60 * 20 /*20分钟*/)
  return url
}

export async function createCoverLink(key: string) {
  return createFileLink(key, bitifulConfig.coverStyle)
}

export async function createPreviewLink(key: string) {
  return createFileLink(key, bitifulConfig.previewStyle)
}

export async function createAlbumLink(key: string) {
  return createFileLink(key, bitifulConfig.albumStyle)
}
