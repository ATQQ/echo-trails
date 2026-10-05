/**
 * Native 壳指纹（nativeHash）的唯一权威实现。
 *
 * 规则（见 docs/release.md）：
 *   - 覆盖 Rust src 目录、gen/android 手写源码、Cargo.lock、归一化后的配置。
 *   - 归一化掉 preset-build.js 因本机 dev IP 改写的行（tauri.conf 的 devUrl /
 *     beforeDevCommand、capabilities 里 `:1420` 的 http allow 规则），以及
 *     version 字段和尾部换行差异，保证同一份 Native 代码在任何机器/CI 上 hash 一致。
 *   - 不覆盖 gen/android 下的 generated 目录、build 产物等自动生成内容。
 *
 * 结果写入 packages/native/src-tauri/native-hash.txt，由 build.rs 注入编译期常量。
 */
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import {
  cargoLockPath,
  cargoTomlPath,
  nativeCommitFilePath,
  nativeHashFilePath,
  projectRoot,
  tauriConfPath,
} from './release-meta.ts'

const srcTauriDir = join(projectRoot, 'packages/native/src-tauri')
const devPort = 1420

function posixRel(from: string, file: string) {
  return relative(from, file).split(sep).join('/')
}

function isTextFile(rel: string) {
  return /\.(rs|toml|json|kt|kts|java|xml|pro|md|txt)$/.test(rel)
}

export function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalJson((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/** 删掉 preset-build.js 写入的 dev 端口 http allow 规则，避免本机 IP 影响 hash。 */
export function stripDevHttpRules(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((item) => {
        if (!item || typeof item !== 'object') return true
        const url = (item as { url?: unknown }).url
        return !(typeof url === 'string' && url.includes(`:${devPort}`))
      })
      .map(stripDevHttpRules)
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = stripDevHttpRules(child)
    }
    return out
  }
  return value
}

export function normalizeJson(rel: string, bytes: Buffer): Buffer {
  let value: unknown
  try {
    value = JSON.parse(bytes.toString('utf8'))
  } catch {
    return bytes
  }

  if (rel.endsWith('tauri.conf.json') && value && typeof value === 'object') {
    const conf = value as Record<string, unknown>
    conf.version = '0'
    const build = conf.build
    if (build && typeof build === 'object') {
      delete (build as Record<string, unknown>).devUrl
      delete (build as Record<string, unknown>).beforeDevCommand
    }
  }

  const normalized = canonicalJson(stripDevHttpRules(value))
  return Buffer.from(JSON.stringify(normalized, null, 2))
}

export function normalizeCargoToml(content: string) {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/^version\s*=\s*".*"/m, 'version = "0"')
    .trim()
}

/**
 * Cargo.lock 里本 crate 的 version 由 setNativeVersion 随壳版本一起改写，
 * 归一化掉它，避免「只升版本不改代码」也被判定成 Native 变化。
 * 其余依赖版本保持原样，依赖变动仍然会影响指纹。
 */
export function normalizeCargoLock(content: string) {
  return content
    .replace(/\r\n/g, '\n')
    .replace(
      /(\[\[package\]\]\nname = "echo-trails"\n)version = "[^"]+"/,
      '$1version = "0"',
    )
    .trim()
}

/**
 * 把单个文件字节归一化成进入指纹前的形态。
 *
 * 必须先统一换行再做结构化归一化：Windows 的 core.autocrlf 会把 checkout 出来的
 * 文本文件变成 CRLF，如果 Cargo.lock 之类的正则先按 LF 匹配，就会漏掉本 crate 版本，
 * 导致同一份代码在 Windows 与 macOS/Linux 上算出不同 nativeHash。
 */
export function normalizeFileBytes(rel: string, bytes: Buffer): Buffer {
  if (rel.endsWith('.json')) return normalizeJson(rel, bytes)
  if (rel.endsWith('Cargo.lock')) return Buffer.from(normalizeCargoLock(bytes.toString('utf8')))
  if (isTextFile(rel)) {
    bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))
  }
  return bytes
}

function readNormalizedFile(absPath: string, rel: string): Buffer {
  return normalizeFileBytes(rel, readFileSync(absPath))
}

/**
 * 系统/编辑器垃圾文件：本机有、CI checkout 没有（或反过来），
 * 一旦进指纹就会让同一份代码在不同机器算出不同 hash，必须剔除。
 */
export function isJunkFile(name: string) {
  return (
    name === '.DS_Store' ||
    name === 'Thumbs.db' ||
    name === 'desktop.ini' ||
    name.endsWith('~') ||
    name.endsWith('.swp') ||
    name.endsWith('.swo')
  )
}

function walkFiles(dir: string, acc: string[], skip?: (full: string) => boolean) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (isJunkFile(name)) continue
    const full = join(dir, name)
    if (skip && skip(full)) continue
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walkFiles(full, acc, skip)
      continue
    }
    if (stat.isFile()) acc.push(full)
  }
}

export function listNativeHashFiles(): { rel: string; bytes: Buffer }[] {
  const files: { rel: string; bytes: Buffer }[] = []
  const seen = new Set<string>()

  const add = (absPath: string, rel: string, transform?: (raw: Buffer) => Buffer) => {
    if (!existsSync(absPath) || seen.has(rel)) return
    seen.add(rel)
    const raw = readNormalizedFile(absPath, rel)
    files.push({ rel, bytes: transform ? transform(raw) : raw })
  }

  const srcFiles: string[] = []
  walkFiles(join(srcTauriDir, 'src'), srcFiles)
  walkFiles(join(srcTauriDir, 'capabilities'), srcFiles)
  // Android 端只纳入手写源码（Manifest / java / res）。以下目录是 Tauri 构建期生成的，
  // 会把本机产物（尤其 jniLibs 里的 .so 软链）算进指纹，必须在 hash 前剔除：
  //   assets/   Tauri 拷入的 tauri.conf.json 副本
  //   jniLibs/  构建产出的 libtauri_app_lib.so 软链
  const androidMainDir = join(srcTauriDir, 'gen/android/app/src/main')
  const androidFiles: string[] = []
  walkFiles(androidMainDir, androidFiles, (full) => {
    const rel = posixRel(androidMainDir, full)
    return (
      rel === 'assets' ||
      rel.startsWith('assets/') ||
      rel === 'jniLibs' ||
      rel.startsWith('jniLibs/') ||
      rel.includes('generated/')
    )
  })

  for (const file of [...srcFiles, ...androidFiles]) {
    add(file, posixRel(srcTauriDir, file))
  }

  add(cargoTomlPath, 'Cargo.toml', (raw) =>
    Buffer.from(normalizeCargoToml(raw.toString('utf8'))),
  )
  add(cargoLockPath, 'Cargo.lock')
  // build.rs 直接决定注入壳的 NATIVE_HASH / EMBEDDED_WEB_VERSION，属于 Native 代码。
  add(join(srcTauriDir, 'build.rs'), 'build.rs')
  add(tauriConfPath, 'tauri.conf.json')
  add(join(srcTauriDir, 'gen/android/app/build.gradle.kts'), 'gen/android/app/build.gradle.kts')
  add(join(srcTauriDir, 'gen/android/app/proguard-rules.pro'), 'gen/android/app/proguard-rules.pro')

  files.sort((a, b) => a.rel.localeCompare(b.rel))
  return files
}

export function computeNativeHash() {
  const hash = createHash('sha256')
  for (const file of listNativeHashFiles()) {
    hash.update(file.rel)
    hash.update('\0')
    hash.update(file.bytes)
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 16)
}

/** 构建期 git 短 hash，写入 native-commit.txt 供 build.rs 注入。 */
export function gitShortCommit() {
  const injected = process.env.NATIVE_GIT_COMMIT?.trim()
  if (injected) return injected
  try {
    const value = execSync('git rev-parse --short HEAD', {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
    return value || 'unknown'
  } catch {
    return 'unknown'
  }
}

export function writeNativeHashFile(hash = computeNativeHash()) {
  mkdirSync(dirname(nativeHashFilePath), { recursive: true })
  writeFileSync(nativeHashFilePath, `${hash}\n`)
  // commit 与 hash 同源写文件：build.rs 里 shell out git 在 CI/沙箱下不可靠。
  writeFileSync(nativeCommitFilePath, `${gitShortCommit()}\n`)
  return hash
}

if (import.meta.main) {
  console.log(writeNativeHashFile())
}
