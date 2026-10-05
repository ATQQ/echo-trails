import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(scriptDir, '../../app')
const projectRoot = path.resolve(scriptDir, '../../..')

// 写 native-hash.txt，供 build.rs 注入 NATIVE_HASH（与 scripts/native-hash.ts 同一套规则）。
// 必须在 cargo 编译前写入，Tauri 的 beforeBuildCommand 正好在这个时机执行。
const hashResult = spawnSync('bun', ['run', 'scripts/native-hash.ts'], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
if (hashResult.error) {
  console.error(hashResult.error)
  process.exit(1)
}
if (hashResult.status !== 0) {
  process.exit(hashResult.status ?? 1)
}

const env = {
  ...process.env,
  VITE_VERSION_URL: process.env.VITE_VERSION_URL || 'https://photo.sugarat.top/version.json',
  VITE_BASE_ORIGIN: process.env.VITE_BASE_ORIGIN || 'https://photo.sugarat.top',
  TAURI: 'true',
}

const result = spawnSync('bun', ['run', 'build'], {
  cwd: appDir,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
