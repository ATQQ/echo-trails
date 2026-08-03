/**
 * 生成 latest.json（tauri updater 标准格式 + android 扩展字段）
 *
 * 在合并后的 release.yml 的 publish-latest-json job 中执行：
 * 各 build job（android / darwin-aarch64 / darwin-x86_64 / windows-x86_64）通过
 * upload-artifact 上传 meta.json + signature.sig，download-artifact 下载到输入目录的子目录。
 * 本脚本读取这些元数据 + tauri.conf.json 的 version，组装 latest.json。
 *
 * 用法：
 *   bun run scripts/generate-latest-json.ts --input ./release-meta --output ./latest.json
 *
 * 输入目录结构（download-artifact 下载后，每个 artifact 一个子目录）：
 *   release-meta/
 *     android/        meta.json { platform, version, md5, apkFileName, description, forceUpdate }
 *     darwin-aarch64/ meta.json { platform, url, version } + signature.sig
 *     darwin-x86_64/  meta.json { platform, url, version } + signature.sig
 *     windows-x86_64/ meta.json { platform, url, version } + signature.sig
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'ATQQ/echo-trails';
const ROOT = path.resolve(import.meta.dir, '..');
const TAURI_CONF = path.join(ROOT, 'packages/native/src-tauri/tauri.conf.json');

interface DesktopMeta {
  platform: string; // darwin-aarch64 | darwin-x86_64 | windows-x86_64
  url: string; // GitHub Release 下载 URL（指向 .app.tar.gz / -setup.exe）
  version: string;
}

interface AndroidMeta {
  platform: 'android';
  version: string;
  md5: string;
  apkFileName: string; // echo-trails-release-0.8.2.apk
  description: string;
  forceUpdate: boolean;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let input = './release-meta';
  let output = './latest.json';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) input = args[++i];
    else if (args[i] === '--output' && args[i + 1]) output = args[++i];
  }
  return { input, output };
}

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
}

function readTauriVersion(): string {
  const conf = readJson<{ version: string }>(TAURI_CONF);
  if (!conf.version) throw new Error(`version not found in ${TAURI_CONF}`);
  return conf.version;
}

function findSignatureFile(dir: string): string | null {
  // 优先 signature.sig，否则找任意 .sig
  const preferred = path.join(dir, 'signature.sig');
  if (fs.existsSync(preferred)) return preferred;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sig'));
  return files.length > 0 ? path.join(dir, files[0]) : null;
}

async function main() {
  const { input, output } = parseArgs();
  const inputDir = path.resolve(process.cwd(), input);

  if (!fs.existsSync(inputDir)) {
    throw new Error(`Input directory not found: ${inputDir}`);
  }

  const version = readTauriVersion();
  console.log(`[latest.json] version from tauri.conf.json: ${version}`);

  const platforms: Record<string, { signature: string; url: string }> = {};
  let android: AndroidMeta | null = null;

  // 遍历输入目录下的子目录（每个 artifact 一个子目录）
  for (const entry of fs.readdirSync(inputDir)) {
    const subDir = path.join(inputDir, entry);
    if (!fs.statSync(subDir).isDirectory()) continue;

    const metaPath = path.join(subDir, 'meta.json');
    if (!fs.existsSync(metaPath)) {
      console.warn(`[latest.json] skip ${entry}: meta.json not found`);
      continue;
    }

    const meta = readJson<DesktopMeta | AndroidMeta>(metaPath);

    if (meta.platform === 'android') {
      android = meta as AndroidMeta;
      console.log(`[latest.json] android: md5=${android.md5}, apk=${android.apkFileName}`);
    } else {
      // 桌面平台：需要 signature
      const sigPath = findSignatureFile(subDir);
      if (!sigPath) {
        console.warn(`[latest.json] skip ${meta.platform}: .sig not found in ${subDir}`);
        continue;
      }
      const signature = fs.readFileSync(sigPath, 'utf-8').trim();
      if (!signature) {
        console.warn(`[latest.json] skip ${meta.platform}: empty signature in ${sigPath}`);
        continue;
      }
      platforms[meta.platform] = { signature, url: (meta as DesktopMeta).url };
      console.log(`[latest.json] ${meta.platform}: ${meta.url}`);
    }
  }

  // 校验
  const missing = ['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64'].filter((p) => !platforms[p]);
  if (missing.length > 0) {
    console.warn(`[latest.json] WARNING: missing desktop platforms: ${missing.join(', ')}`);
  }
  if (!android) {
    throw new Error('[latest.json] android meta not found');
  }

  // 组装 latest.json
  const androidUrl = `https://github.com/${REPO}/releases/download/v${version}/${android.apkFileName}`;
  const latest = {
    version,
    notes: android.description || '',
    pub_date: new Date().toISOString(),
    platforms,
    android: {
      version,
      downloadUrl: androidUrl,
      forceUpdate: !!android.forceUpdate,
      description: android.description || '',
      md5: android.md5,
    },
  };

  fs.writeFileSync(output, JSON.stringify(latest, null, 2) + '\n');
  console.log(`[latest.json] written to ${output}`);
  console.log(JSON.stringify(latest, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
