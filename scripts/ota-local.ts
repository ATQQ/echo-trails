/**
 * 本地热更新验证（局域网，自动探测本机 IP，绝不改线上 version.json）。
 *
 * 流程：
 *   bun run ota:local              打基线 APK → 安装 → 回车后发 Web 离线包，服务一直挂着
 *   bun run ota:local apk          只打 APK、写「无更新」清单、安装，然后挂服务
 *   bun run ota:local web          只打 zip 并改清单（服务需已在跑，或加 --serve）
 *   bun run ota:local serve        只起静态服务
 *   bun run ota:local fail         把清单 md5 改坏，用来测回滚
 *
 * 环境变量：
 *   OTA_LOCAL_IP     强制使用的电脑 IP（默认自动探测 192.168/10）
 *   OTA_LOCAL_PORT   静态服务端口，默认 8765
 *   VITE_BASE_ORIGIN API 地址，默认 http://<IP>:6692
 *   --no-install     不执行 adb install
 *   --serve          与 web 一起用：打完 zip 后挂服务
 */
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { extname, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  OTA_PLATFORMS,
  apkFileName,
  appPackagePath,
  projectRoot,
  readPackageVersion,
  releaseDir,
  tauriConfPath,
  webPackageFileName,
  writeJson,
  type PlatformVersionInfo,
  type VersionFile,
  type WebPackageInfo,
} from './release-meta.ts'
import { computeNativeHash, writeNativeHashFile } from './native-hash.ts'

const OTA_DIR = join(releaseDir, 'ota-local')
const BEFORE_BUILD = join(projectRoot, 'packages/native/scripts/before-build.mjs')
const WEB_DIST = join(projectRoot, 'packages/app/dist')
const DEFAULT_PORT = 8765
const APK_FALLBACK = join(
  projectRoot,
  'packages/native/src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk',
)

const MIME: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.zip': 'application/zip',
  '.apk': 'application/vnd.android.package-archive',
  '.html': 'text/html; charset=utf-8',
}

function printHelp() {
  console.log(`本地热更新验证（自动探测局域网 IP，不改线上 version.json）。

用法:
  bun run ota:local              打基线 APK → 安装 → 回车后发 Web 离线包，服务一直挂着
  bun run ota:local apk          只打 APK、写「无更新」清单、安装，然后挂服务
  bun run ota:local web          只打 zip 并改清单（服务需已在跑，或加 --serve）
  bun run ota:local serve        只起静态服务
  bun run ota:local fail         把清单 md5 改坏，用来测回滚

环境变量:
  OTA_LOCAL_IP     强制使用的电脑 IP（默认自动探测 192.168/10）
  OTA_LOCAL_PORT   静态服务端口，默认 ${DEFAULT_PORT}
  VITE_BASE_ORIGIN API 地址，默认 http://<IP>:6692
  --no-install     不执行 adb install
  --serve          与 web 一起用：打完 zip 后挂服务

桌面端验证：先跑 bun run ota:local serve，再用 VITE_VERSION_URL=http://<IP>:${DEFAULT_PORT}/version.json
重新构建桌面端，冷启动窗口内会自动刷新。`)
}

function getLanIp() {
  const forced = process.env.OTA_LOCAL_IP?.trim()
  if (forced) return forced
  const found: string[] = []
  const nets = networkInterfaces()
  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      if (net.family !== 'IPv4' || net.internal) continue
      if (net.address.startsWith('169.254.')) continue
      found.push(net.address)
    }
  }
  return (
    found.find((ip) => ip.startsWith('192.168.')) ||
    found.find((ip) => ip.startsWith('10.')) ||
    found[0] ||
    '127.0.0.1'
  )
}

function apkVersion() {
  const tauri = JSON.parse(readFileSync(tauriConfPath, 'utf-8')) as { version?: string }
  return String(tauri.version || readPackageVersion(appPackagePath) || '0.0.0')
}

function md5Of(filePath: string) {
  return createHash('md5').update(readFileSync(filePath)).digest('hex')
}

function nextLocalWebVersion(currentApk: string, currentWeb: string) {
  if (!currentWeb || currentWeb === currentApk) return `${currentApk}.1`
  const parts = currentWeb.split('.').map((part) => Number.parseInt(part, 10) || 0)
  if (parts.length === 0) return `${currentApk}.1`
  parts[parts.length - 1] = (parts[parts.length - 1] ?? 0) + 1
  return parts.join('.')
}

function readLocalManifest(): VersionFile | null {
  const path = join(OTA_DIR, 'version.json')
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8')) as VersionFile
}

function writeLocalManifest(data: VersionFile) {
  mkdirSync(OTA_DIR, { recursive: true })
  writeJson(join(OTA_DIR, 'version.json'), data)
}

function publicBase(ip: string, port: number) {
  return `http://${ip}:${port}`
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function waitEnter(message: string) {
  return new Promise<void>((resolve) => {
    process.stdout.write(`${message}\n`)
    process.stdin.resume()
    process.stdin.once('data', () => resolve())
  })
}

function contentType(filePath: string) {
  return MIME[extname(filePath).toLowerCase()] || 'application/octet-stream'
}

function startServer(ip: string, port: number) {
  mkdirSync(OTA_DIR, { recursive: true })
  const server = createServer((req, res) => {
    const rawPath = decodeURIComponent((req.url ?? '/').split('?')[0] || '/')
    const relativePath = rawPath === '/' ? 'version.json' : rawPath.replace(/^\/+/, '')
    const filePath = resolve(OTA_DIR, relativePath)
    if (!filePath.startsWith(resolve(OTA_DIR))) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Cache-Control': 'no-store' })
      res.end('not found')
      return
    }
    const body = readFileSync(filePath)
    res.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(body)
  })
  return new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '0.0.0.0', () => {
      console.log(`[ota-local] 静态服务 ${publicBase(ip, port)}/version.json`)
      console.log(`[ota-local] 目录 ${relative(projectRoot, OTA_DIR)}`)
      resolve()
    })
  })
}

function localEnv(ip: string, port: number, appVersion?: string) {
  return {
    ...process.env,
    VITE_BASE_ORIGIN: process.env.VITE_BASE_ORIGIN?.trim() || `http://${ip}:6692`,
    VITE_VERSION_URL: `${publicBase(ip, port)}/version.json`,
    TAURI: 'true',
    ...(appVersion ? { VITE_APP_VERSION: appVersion } : {}),
  }
}

/** 同一份离线包写入所有 OTA 平台（桌面端与 Android 共用同一 zip）。 */
function platformEntries(
  base: Omit<PlatformVersionInfo, 'webPackage'>,
  webPackage: WebPackageInfo,
): VersionFile {
  const data: VersionFile = {}
  for (const platform of OTA_PLATFORMS) {
    data[platform] = { ...base, webPackage: { ...webPackage } }
  }
  return data
}

function writeBaselineManifest(ip: string, port: number, nativeHash: string, version: string) {
  writeLocalManifest(
    platformEntries(
      {
        version,
        downloadUrl: '',
        forceUpdate: false,
        description: '',
        md5: '',
        fileSize: 0,
        nativeHash,
      },
      { version, downloadUrl: '', md5: '', fileSize: 0 },
    ),
  )
  console.log(`[ota-local] 已写无更新清单 nativeHash=${nativeHash} version=${version}`)
  console.log(
    `[ota-local] 平台 ${OTA_PLATFORMS.join('/')}；请打开 ${publicBase(ip, port)}/version.json 确认能访问`,
  )
}

function findApk(version: string) {
  const named = join(releaseDir, apkFileName(version))
  if (existsSync(named)) return named
  return existsSync(APK_FALLBACK) ? APK_FALLBACK : null
}

function adbInstall(apkPath: string) {
  const devices = spawnSync('adb', ['devices'], { encoding: 'utf8' })
  if (devices.status !== 0) {
    console.warn('[ota-local] 找不到 adb，请手动安装:')
    console.warn(`  ${apkPath}`)
    return
  }
  const serials = (devices.stdout || '')
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('\tdevice'))
  if (serials.length === 0) {
    console.warn('[ota-local] 没有已连接的设备，请手动安装:')
    console.warn(`  adb install -r ${apkPath}`)
    return
  }
  console.log(`[ota-local] adb install -r ${apkPath}`)
  run('adb', ['install', '-r', apkPath], process.env)
}

async function buildApk(ip: string, port: number) {
  const version = apkVersion()
  const env = localEnv(ip, port, version)
  console.log(`[ota-local] 电脑 IP ${ip}`)
  console.log(`[ota-local] VERSION_URL ${env.VITE_VERSION_URL}`)
  console.log(`[ota-local] BASE_ORIGIN ${env.VITE_BASE_ORIGIN}`)
  const hash = writeNativeHashFile(computeNativeHash())
  writeBaselineManifest(ip, port, hash, version)
  console.log('\n======== 开始打基线 APK（可能要几分钟） ========\n')
  run('bun', ['--filter', 'echo-trails-native', 'build:android'], env)
  const hashAfter = writeNativeHashFile(computeNativeHash())
  writeBaselineManifest(ip, port, hashAfter, version)
  const apkPath = findApk(version)
  if (!apkPath) {
    console.error('[ota-local] 找不到 APK')
    process.exit(1)
  }
  const servedApk = join(OTA_DIR, apkFileName(version))
  writeFileSync(servedApk, readFileSync(apkPath))
  console.log(`[ota-local] APK ${apkPath}`)
  if (!process.argv.includes('--no-install')) {
    adbInstall(apkPath)
  }
  return { version, hash: hashAfter, apkPath }
}

function packWeb(ip: string, port: number, badMd5 = false) {
  const version = apkVersion()
  const nativeHash =
    readLocalManifest()?.android?.nativeHash || writeNativeHashFile(computeNativeHash())
  const previousWeb = readLocalManifest()?.android?.webPackage?.version || version
  const webVersion = nextLocalWebVersion(version, previousWeb)
  const env = localEnv(ip, port, webVersion)
  console.log(`[ota-local] 打 Web 离线包 ${webVersion}`)
  run('bun', [BEFORE_BUILD], env)
  if (!existsSync(join(WEB_DIST, 'index.html'))) {
    console.error('[ota-local] web dist 缺少 index.html')
    process.exit(1)
  }
  mkdirSync(OTA_DIR, { recursive: true })
  const zipName = webPackageFileName(webVersion)
  const zipPath = join(OTA_DIR, zipName)
  if (existsSync(zipPath)) unlinkSync(zipPath)
  const zip = spawnSync('zip', ['-qr', zipPath, '.'], {
    cwd: WEB_DIST,
    stdio: 'inherit',
  })
  if (zip.status !== 0) {
    console.error('[ota-local] zip 失败，请确认已安装 zip 命令')
    process.exit(zip.status ?? 1)
  }
  const md5 = badMd5 ? 'deadbeefdeadbeefdeadbeefdeadbeef' : md5Of(zipPath)
  const fileSize = statSync(zipPath).size
  writeLocalManifest(
    platformEntries(
      {
        version,
        downloadUrl: '',
        forceUpdate: false,
        description: `## 本次更新\n- 本地热更新验证 ${webVersion}`,
        md5: '',
        fileSize: 0,
        nativeHash,
      },
      {
        version: webVersion,
        downloadUrl: `${publicBase(ip, port)}/${zipName}`,
        md5,
        fileSize,
      },
    ),
  )
  console.log(`[ota-local] zip ${zipPath}`)
  console.log(`[ota-local] md5 ${md5}${badMd5 ? ' (故意写坏，用来测失败回滚)' : ''}`)
  console.log(`[ota-local] 清单 ${publicBase(ip, port)}/version.json（${OTA_PLATFORMS.join('/')}）`)
  return webVersion
}

async function main() {
  const args = process.argv.slice(2).filter((item) => item !== '--')
  if (args.includes('-h') || args.includes('--help')) {
    printHelp()
    return
  }
  const command = args.find((item) => !item.startsWith('-')) || 'all'
  if (!['apk', 'web', 'serve', 'fail', 'all'].includes(command)) {
    console.error(`未知命令：${command}`)
    printHelp()
    process.exit(1)
  }
  const ip = getLanIp()
  const port = Number(process.env.OTA_LOCAL_PORT) || DEFAULT_PORT
  const keepServer =
    command === 'serve' || command === 'apk' || command === 'all' || args.includes('--serve')

  if ((command === 'web' || command === 'fail') && !keepServer) {
    packWeb(ip, port, command === 'fail')
    console.log('\n热更新包已就绪。杀进程重开 App，冷启动窗口内应静默生效。')
    return
  }

  await startServer(ip, port)

  if (command === 'apk' || command === 'all') {
    await buildApk(ip, port)
    console.log('\n打开 App，确认版本为壳内置 Web 版本，检查更新应提示已是最新。')
  }

  if (command === 'all') {
    await waitEnter('\n准备好后按回车：打包 Web 离线包并写入有更新的清单（不改 git 里的 version.json）。')
  }

  if (command === 'web' || command === 'fail' || command === 'all') {
    const webVersion = packWeb(ip, port, command === 'fail')
    if (command === 'fail') {
      console.log('\n启动应因 md5 校验失败而回滚，仍停留在旧版本。')
    } else {
      console.log(`\n杀掉 App 再打开，应在启动窗口内自动刷新到 v${webVersion}。`)
      console.log('测失败回滚：另开终端 bun run ota:local fail')
    }
  }

  console.log('服务已启动，Ctrl+C 结束。')
  await new Promise(() => {})
}

await main()
