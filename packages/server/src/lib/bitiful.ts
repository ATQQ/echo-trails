import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Store } from './store';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';

export const bitifulConfig = {
  accessKey: process.env.S3_ACCESS_KEY,
  secretKey: process.env.S3_SECRET_KEY,
  bucket: process.env.S3_BUCKET,
  domain: process.env.S3_DOMAIN,
  cdnToken: process.env.BITIFUL_CDN_TOKEN || '',
  coverStyle: process.env.BITIFUL_COVER_STYLE,
  previewStyle: process.env.BITIFUL_PREVIEW_STTYLE,
  albumStyle: process.env.BITIFUL_ALBUM_STYLE,
  region: process.env.S3_REGION || 'cn-east-1',
  endpoint: process.env.S3_ENDPOINT || 'https://s3.bitiful.net',
}

// 配置字段到环境变量名的映射关系
const CONFIG_TO_ENV_MAP = {
  accessKey: 'S3_ACCESS_KEY',
  secretKey: 'S3_SECRET_KEY',
  bucket: 'S3_BUCKET',
  domain: 'S3_DOMAIN',
  region: 'S3_REGION',
  coverStyle: 'BITIFUL_COVER_STYLE',
  previewStyle: 'BITIFUL_PREVIEW_STTYLE',
  albumStyle: 'BITIFUL_ALBUM_STYLE',
  cdnToken: 'BITIFUL_CDN_TOKEN',
  endpoint: 'S3_ENDPOINT',
} as const;

export function refreshBitifulConfig(v: Partial<typeof bitifulConfig>) {
  // 提取非空的值
  const notNullKeys = Object.fromEntries(
    Object.entries(v).filter(([key, v]) => {
      // 排除Style
      if (key.endsWith('Style')) {
        return true
      }
      return !!v
    })
  )

  Object.assign(bitifulConfig, notNullKeys)

  // 构建环境变量对象
  const envVars = Object.entries(CONFIG_TO_ENV_MAP).reduce((acc, [configKey, envKey]) => {
    const value = bitifulConfig[configKey as keyof typeof bitifulConfig];

    // Style 字段始终写入，其他字段只有非空值才写入
    if (configKey.endsWith('Style') || value) {
      acc[envKey] = value || '';
    }

    return acc;
  }, {} as Record<string, string>);

  writeEnvToLocal(envVars);
}

// 实现一个方法将目标环境变量写入.env.local 中
export function writeEnvToLocal(envVars: Record<string, string>): void {
  const projectRoot = path.resolve(__dirname, '../../');
  const envLocalPath = path.join(projectRoot, '.env.local');

  let existingContent = '';
  const envMap = new Map<string, string>();

  // 读取现有的 .env.local 文件（如果存在）
  if (fs.existsSync(envLocalPath)) {
    existingContent = fs.readFileSync(envLocalPath, 'utf-8');

    // 解析现有的环境变量
    const lines = existingContent.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const equalIndex = trimmedLine.indexOf('=');
        if (equalIndex > 0) {
          const key = trimmedLine.substring(0, equalIndex).trim();
          const value = trimmedLine.substring(equalIndex + 1).trim();
          envMap.set(key, value);
        }
      }
    }
  }

  // 更新或添加新的环境变量
  for (const [key, value] of Object.entries(envVars)) {
    envMap.set(key, value);
  }

  // 生成新的文件内容
  const newContent = Array.from(envMap.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');


  // 写入文件
  fs.writeFileSync(envLocalPath, newContent + '\n', 'utf-8');
}

class BitifulS3Manager {
  private s3Client: S3Client;

  constructor() {
    this.s3Client = this.createS3Client();
  }

  private createS3Client(): S3Client {
    return new S3Client({
      endpoint: bitifulConfig.endpoint,
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

  let url = await getSignedUrl(bitifulS3Manager.getClient(), command, { expiresIn: 60 * 30 /*半小时*/ })
  if (bitifulConfig.domain.startsWith('http') && bitifulConfig.cdnToken) {
    url = createLink(key, bitifulConfig.domain, bitifulConfig.cdnToken, style)
  }
  // 添加缓存，避免频繁构造请求，缓存失效
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

function createLink(key: string, domain: string, token: string, style?: string) {
  const deadLine = Math.floor(Date.now() / 1000) + 60 * 30; // 链接在未来的 60秒 内有效
  const fileName = `/${key}` + (style ? `!style:${style}` : '')
  const rawString = token + fileName + deadLine;
  const md5Result = crypto.createHash('md5').update(rawString).digest('hex');
  const tokenLink = domain + fileName + "?_btf_tk=" + md5Result + "&_ts=" + deadLine;
  return tokenLink;
}
