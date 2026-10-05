/**
 * Web 版本升级（热更新双轨里的“日常迭代”）。
 *
 * 只升 Web 版本：packages/app、packages/server，并把本次发布说明写进
 * version.json / update.json 的 description。不碰 Native 壳版本（见 upgrade-native.ts）。
 *
 * 注意：会清空 version.json 里旧的 webPackage，避免把上一版离线包当新版发出去；
 * 随后必须跑 `bun run pack:web-package` 重新写入 webPackage 再部署。
 */
import semver from 'semver'
import prompts from 'prompts'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import {
  OTA_PLATFORMS,
  appPackagePath,
  findUpdateEntry,
  serverPackagePath,
  updateJsonPath,
  versionJsonPath,
  readJson,
  readUpdateFile,
  writeJson,
} from './release-meta.ts'

function parseArgs(argv: string[]) {
  const args = argv.filter((item) => item !== '--')
  const readValue = (flag: string) => {
    const index = args.indexOf(flag)
    return index !== -1 && args[index + 1] ? args[index + 1] : ''
  }
  return {
    version: readValue('--version'),
    prerelease: readValue('--pre'),
    desc: readValue('--desc'),
    patch: args.includes('--patch'),
  }
}

async function resolveVersion(currentVersion: string, opts: ReturnType<typeof parseArgs>) {
  const patch = semver.inc(currentVersion, 'patch')!
  const minor = semver.inc(currentVersion, 'minor')!
  const major = semver.inc(currentVersion, 'major')!

  if (opts.version) {
    if (!semver.valid(opts.version)) {
      console.error(`Error: Invalid version ${opts.version}`)
      process.exit(1)
    }
    return opts.version
  }
  if (opts.patch) return patch
  if (opts.prerelease) return semver.inc(currentVersion, 'prepatch', opts.prerelease) || ''

  const response = await prompts({
    type: 'select',
    name: 'value',
    message: 'Select Web release type',
    choices: [
      { title: `Patch (${patch})`, value: patch },
      { title: `Minor (${minor})`, value: minor },
      { title: `Major (${major})`, value: major },
      { title: 'Custom', value: 'custom' },
    ],
  })
  if (!response.value) {
    console.log('Operation cancelled.')
    process.exit(0)
  }
  if (response.value === 'custom') {
    const custom = await prompts({
      type: 'text',
      name: 'value',
      message: 'Enter custom version',
      validate: (value: string) => (semver.valid(value) ? true : 'Invalid semver version'),
    })
    return custom.value as string
  }
  return response.value as string
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const appPkg = readJson<Record<string, unknown>>(appPackagePath)
  const currentVersion = String(appPkg.version || '')
  if (!semver.valid(currentVersion)) {
    console.error(`Error: Current version ${currentVersion} is invalid.`)
    process.exit(1)
  }
  console.log(`Current Web version: ${currentVersion}`)

  const newVersion = await resolveVersion(currentVersion, opts)
  if (!newVersion) {
    console.log('Operation cancelled.')
    process.exit(0)
  }

  let description = opts.desc
  if (!description) {
    const response = await prompts({
      type: 'text',
      name: 'value',
      message: 'Enter release description (optional)',
      initial: 'Maintenance update',
    })
    description = response.value || ''
  }

  console.log(`\nUpgrading Web to: ${newVersion}\n`)

  appPkg.version = newVersion
  writeJson(appPackagePath, appPkg)
  console.log(`Updated ${appPackagePath}`)

  if (existsSync(serverPackagePath)) {
    const serverPkg = readJson<Record<string, unknown>>(serverPackagePath)
    serverPkg.version = newVersion
    writeJson(serverPackagePath, serverPkg)
    console.log(`Updated ${serverPackagePath}`)
  }

  // version.json：只写 description 并清空旧 webPackage，壳版本 / nativeHash 不动。
  const versionData = readJson<Record<string, Record<string, unknown>>>(versionJsonPath)
  for (const platform of OTA_PLATFORMS) {
    const entry = versionData[platform]
    if (!entry) continue
    if (description) entry.description = description
    delete entry.webPackage
  }
  writeJson(versionJsonPath, versionData)
  console.log(`Updated ${versionJsonPath}（webPackage 已清空，待 pack:web-package 写入）`)

  const updateData = readUpdateFile()
  for (const platform of OTA_PLATFORMS) {
    // 只改「本次版本」的条目；历史版本说明与桌面占位条目保持原样
    const entry = findUpdateEntry(updateData[platform], newVersion)
    if (!entry) continue
    if (description) entry.description = description
    delete entry.webPackage
  }
  if (existsSync(updateJsonPath)) {
    writeFileSync(updateJsonPath, `${JSON.stringify(updateData, null, 2)}\n`)
    console.log(`Updated ${updateJsonPath}`)
  }

  console.log('\n下一步：')
  console.log('  bun run pack:web-package     # 打包离线包并写 webPackage')
  console.log('  bun run upload:web-package   # 上传 CDN')
  console.log('  bun run deploy:client        # 发布 Web + version.json')
  console.log('  （若 Native 代码有变化，先跑 bun run upgrade:native --check）')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
