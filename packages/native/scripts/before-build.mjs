import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(scriptDir, '../../app')

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
