import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Define paths relative to the project root (assuming this script is in scripts/ folder)
const projectRoot = resolve(import.meta.dir, '..');
const tauriConfigPath = join(projectRoot, 'packages/native/src-tauri/tauri.conf.json');
const sourceApkPath = join(projectRoot, 'packages/native/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk');
const releaseDir = join(projectRoot, 'release');

function main() {
  console.log('📦 Starting Android APK rename script...');

  // 1. Get version from tauri.conf.json
  if (!existsSync(tauriConfigPath)) {
    console.error(`❌ Tauri config not found at: ${tauriConfigPath}`);
    process.exit(1);
  }

  const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf-8'));
  const version = tauriConfig.version;

  if (!version) {
    console.error('❌ Version not found in tauri.conf.json');
    process.exit(1);
  }

  console.log(`ℹ️  Detected version: ${version}`);

  // 2. Check if source APK exists
  if (!existsSync(sourceApkPath)) {
    console.error(`❌ Source APK not found at: ${sourceApkPath}`);
    console.error('   Make sure the build completed successfully.');
    process.exit(1);
  }

  // 3. Prepare destination
  if (!existsSync(releaseDir)) {
    console.log(`ℹ️  Creating release directory: ${releaseDir}`);
    mkdirSync(releaseDir, { recursive: true });
  }

  const targetFileName = `echo-trails-release-${version}.apk`;
  const targetPath = join(releaseDir, targetFileName);

  // 4. Copy file
  try {
    copyFileSync(sourceApkPath, targetPath);
    console.log(`✅ APK successfully copied to:`);
    console.log(`   ${targetPath}`);
    
    // Reveal in Finder (macOS)
    if (process.platform === 'darwin') {
      spawnSync('open', ['-R', targetPath]);
    }
  } catch (error) {
    console.error('❌ Failed to copy APK:', error);
    process.exit(1);
  }
}

main();
