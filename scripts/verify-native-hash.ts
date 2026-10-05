/**
 * CI 校验：tag 提交里的 version.json 各端 nativeHash 必须与本次构建指纹一致。
 *
 * 为什么是校验而不是回写：
 *   nativeHash 由 scripts/native-hash.ts 确定性计算（dev IP / version / 换行都已归一化），
 *   发版前必须先 `bun run upgrade:native` 把它写进 version.json。CI 若算出来和提交里的
 *   不一致，只有两种可能——改了 Native 代码却忘了升壳，或者清单被改过，两种情况都应该
 *   直接失败，而不是让 CI 悄悄覆盖掉错误值（那样本地与 CI 的漂移就永远发现不了）。
 *
 * 判定：
 *   - android 必须存在且带正确的 nativeHash（它是 CI 唯一出安装包的端）。
 *   - 其余 OTA 平台条目存在就必须带正确 nativeHash；整条缺失则跳过。
 *
 * 用法：bun run scripts/verify-native-hash.ts [--file <别的清单路径>]
 * 退出码：0 全部一致；1 存在缺失或不一致。
 */
import {
  OTA_PLATFORMS,
  readJson,
  readVersionFile,
  versionJsonPath,
  type VersionFile,
} from './release-meta.ts'
import { computeNativeHash } from './native-hash.ts'

export type NativeHashCheckStatus = 'ok' | 'mismatch' | 'missing-hash' | 'absent'

export type NativeHashCheck = {
  platform: string
  status: NativeHashCheckStatus
  expected: string
  actual: string
}

export function checkNativeHash(
  versionData: VersionFile,
  expected: string,
): { ok: boolean; rows: NativeHashCheck[] } {
  const rows: NativeHashCheck[] = []
  for (const platform of OTA_PLATFORMS) {
    const entry = versionData[platform]
    if (!entry) {
      rows.push({ platform, status: 'absent', expected, actual: '' })
      continue
    }
    const actual = (entry.nativeHash || '').trim()
    if (!actual) {
      rows.push({ platform, status: 'missing-hash', expected, actual: '' })
      continue
    }
    rows.push({
      platform,
      status: actual === expected ? 'ok' : 'mismatch',
      expected,
      actual,
    })
  }
  return { ok: rows.every((row) => !isFatalCheck(row)), rows }
}

/**
 * 判定某一行是否算失败：
 *   - 一致的通过；
 *   - 整条平台条目缺失可以跳过（历史清单可能只有部分端），但 android 缺失必须失败；
 *   - 有不一致的 hash / 有条目却没写 hash 都失败。
 */
export function isFatalCheck(row: NativeHashCheck) {
  if (row.status === 'ok') return false
  if (row.status === 'absent') return row.platform === 'android'
  return true
}

const STATUS_TEXT: Record<NativeHashCheckStatus, string> = {
  ok: 'ok',
  mismatch: '不一致',
  'missing-hash': '缺少 nativeHash',
  absent: '已跳过（无该平台条目）',
}

function formatRow(row: NativeHashCheck) {
  const actual = row.actual || '-'
  const platform = row.platform.padEnd(8)
  return `  ${platform} 提交=${actual.padEnd(17)} CI计算=${row.expected.padEnd(17)} ${STATUS_TEXT[row.status]}`
}

function main() {
  const expected = computeNativeHash()
  // 默认校验仓库里的权威清单；--file 可指向别的清单（本地排障 / 校验 release/ota-local/version.json）
  const fileIndex = process.argv.indexOf('--file')
  const filePath = fileIndex >= 0 && process.argv[fileIndex + 1] ? process.argv[fileIndex + 1] : ''
  const versionData = filePath ? readJson<VersionFile>(filePath) : readVersionFile()
  const target = filePath || versionJsonPath
  const { ok, rows } = checkNativeHash(versionData, expected)

  console.log(`[verify-native-hash] 清单 ${target}`)
  console.log(`[verify-native-hash] CI 计算 nativeHash=${expected}`)
  rows.forEach((row) => console.log(formatRow(row)))

  if (ok) {
    console.log('[verify-native-hash] 通过：清单与本次构建指纹一致')
    return
  }

  const problems = rows.filter(isFatalCheck)
  const detail = problems
    .map((row) => `${row.platform}(${STATUS_TEXT[row.status]})`)
    .join('、')
  const message = `nativeHash 校验失败：${detail}。请先在本地跑 \`bun run upgrade:native\` 并提交 version.json 再打 tag。`
  console.error(`[verify-native-hash] ${message}`)
  if (process.env.GITHUB_ACTIONS) console.error(`::error::${message}`)
  process.exit(1)
}

if (import.meta.main) {
  main()
}
