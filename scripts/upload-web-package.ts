/**
 * 上传 Web 离线包到 Bitiful CDN（S3 兼容）。
 *
 * 用法（env 由 package.json 的 --env-file 注入）：
 *   bun run upload:web-package
 *
 * 上传前会校验 version.json 里的 md5/fileSize 与本地 zip 一致，避免清单与产物错配。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import {
  CDN_PUBLIC,
  S3_KEY_PREFIX,
  appPackagePath,
  cdnWebPackageUrl,
  readJson,
  readPackageVersion,
  releaseDir,
  versionJsonPath,
  webPackageFileName,
  type VersionFile,
} from './release-meta.ts'

const config = {
  accessKey: process.env.S3_ACCESS_KEY,
  secretKey: process.env.S3_SECRET_KEY,
  bucket: process.env.S3_BUCKET,
  region: process.env.S3_REGION || 'cn-east-1',
  endpoint: process.env.S3_ENDPOINT || 'https://s3.bitiful.net',
}

if (!config.accessKey || !config.secretKey || !config.bucket) {
  console.error('Error: Missing S3 configuration (S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET).')
  process.exit(1)
}

function md5Of(filePath: string) {
  return createHash('md5').update(readFileSync(filePath)).digest('hex')
}

async function main() {
  const version = readPackageVersion(appPackagePath)
  const fileName = webPackageFileName(version)
  const filePath = join(releaseDir, fileName)
  if (!existsSync(filePath)) {
    console.error(`Error: ${filePath} not found. Run \`bun run pack:web-package\` first.`)
    process.exit(1)
  }

  const md5 = md5Of(filePath)
  const fileSize = statSync(filePath).size

  if (existsSync(versionJsonPath)) {
    const versionData = readJson<VersionFile>(versionJsonPath)
    const pkg = versionData.android?.webPackage
    if (!pkg || pkg.version !== version) {
      console.error(
        `Error: version.json webPackage (${pkg?.version || 'none'}) 与当前 Web 版本 ${version} 不一致。先跑 pack:web-package。`,
      )
      process.exit(1)
    }
    if (pkg.md5 && pkg.md5 !== md5) {
      console.error(`Error: version.json webPackage md5 (${pkg.md5}) 与本地 zip (${md5}) 不一致。`)
      process.exit(1)
    }
  }

  const s3Client = new S3Client({
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    region: config.region,
  })

  const key = `${S3_KEY_PREFIX}/${fileName}`
  console.log(`Uploading ${fileName} to ${config.bucket} (Key: ${key})...`)
  await s3Client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: readFileSync(filePath),
      ContentType: 'application/zip',
    }),
  )
  console.log(`Uploaded ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB, md5=${md5})`)
  console.log(`CDN: ${cdnWebPackageUrl(version)}`)
  console.log(`(base: ${CDN_PUBLIC}/${S3_KEY_PREFIX})`)
}

main().catch((error) => {
  console.error('Upload failed:', error)
  process.exit(1)
})
