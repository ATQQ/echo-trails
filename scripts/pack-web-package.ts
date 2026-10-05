/**
 * 打包 Web 离线包（OTA）。
 *
 * 产出 release/echo-trails-web-<webVersion>.zip，并把 webPackage 写进
 * version.json（所有 OTA 平台）与 update.json（兼容旧客户端）。
 *
 * 用法：
 *   bun run pack:web-package              重新构建前端再打包
 *   bun run pack:web-package --skip-build 复用 packages/app/dist
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  OTA_PLATFORMS,
  appDistDir,
  appPackagePath,
  cdnWebPackageUrl,
  findUpdateEntry,
  projectRoot,
  readJson,
  readPackageVersion,
  releaseDir,
  updateJsonPath,
  versionJsonPath,
  webPackageFileName,
  type VersionFile,
  type UpdateFile,
  type WebPackageInfo,
} from './release-meta.ts'

const skipBuild = process.argv.includes('--skip-build')
const beforeBuild = join(projectRoot, 'packages/native/scripts/before-build.mjs')

function md5Of(filePath: string) {
  return createHash('md5').update(readFileSync(filePath)).digest('hex')
}

function main() {
  const version = readPackageVersion(appPackagePath)
  if (!version) {
    console.error('Error: packages/app/package.json version is missing.')
    process.exit(1)
  }

  if (!skipBuild) {
    const build = spawnSync('bun', [beforeBuild], {
      cwd: projectRoot,
      env: {
        ...process.env,
        VITE_BASE_ORIGIN: 'https://photo.sugarat.top',
        VITE_VERSION_URL: 'https://photo.sugarat.top/version.json',
        TAURI: 'true',
      },
      stdio: 'inherit',
    })
    if (build.status !== 0) {
      process.exit(build.status ?? 1)
    }
  }

  if (!existsSync(join(appDistDir, 'index.html'))) {
    console.error(`Error: ${appDistDir}/index.html not found. Build the web dist first.`)
    process.exit(1)
  }

  mkdirSync(releaseDir, { recursive: true })
  const zipName = webPackageFileName(version)
  const zipPath = join(releaseDir, zipName)
  if (existsSync(zipPath)) unlinkSync(zipPath)

  const zip = spawnSync('zip', ['-qr', zipPath, '.'], {
    cwd: appDistDir,
    stdio: 'inherit',
  })
  if (zip.error || zip.status !== 0) {
    console.error('Error: zip failed. 确认已安装 zip 命令，或用 --skip-build 复用已有 dist。')
    console.error(zip.error)
    process.exit(zip.status ?? 1)
  }

  const md5 = md5Of(zipPath)
  const fileSize = statSync(zipPath).size
  const pkg: WebPackageInfo = {
    version,
    downloadUrl: cdnWebPackageUrl(version),
    md5,
    fileSize,
  }
  console.log(`Wrote ${zipPath}`)
  console.log(`MD5: ${md5}`)
  console.log(`Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`)

  const versionData = readJson<VersionFile>(versionJsonPath)
  for (const platform of OTA_PLATFORMS) {
    const entry = versionData[platform]
    if (!entry) continue
    entry.webPackage = { ...pkg }
  }
  writeFileSync(versionJsonPath, `${JSON.stringify(versionData, null, 2)}\n`)
  console.log(`Updated ${versionJsonPath}`)

  if (existsSync(updateJsonPath)) {
    const updateData = readJson<UpdateFile>(updateJsonPath)
    for (const platform of OTA_PLATFORMS) {
      // 只挂到本次版本的条目上，别把 webPackage 挂到桌面端的 0.1.2 占位条目
      const entry = findUpdateEntry(updateData[platform], version)
      if (!entry) continue
      entry.webPackage = { ...pkg }
    }
    writeFileSync(updateJsonPath, `${JSON.stringify(updateData, null, 2)}\n`)
    console.log(`Updated ${updateJsonPath}`)
  }
}

main()
