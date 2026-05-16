import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Define paths relative to the project root (assuming this script is in scripts/ folder)
const projectRoot = resolve(import.meta.dir, '..');
const tauriConfigPath = join(projectRoot, 'packages/native/src-tauri/tauri.conf.json');
const androidOutputDir = join(projectRoot, 'packages/native/src-tauri/gen/android/app/build/outputs');
const releaseDir = join(projectRoot, 'release');

type Artifact = {
  label: string;
  sourcePath: string;
  targetName: string;
  required?: boolean;
};

function formatSize(filePath: string) {
  const mb = statSync(filePath).size / 1024 / 1024;
  return `${mb.toFixed(1)} MB`;
}

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

  const apkCandidates: Artifact[] = [
    {
      label: 'arm64 release APK',
      sourcePath: join(androidOutputDir, 'apk/arm64/release/app-arm64-release.apk'),
      targetName: `echo-trails-release-${version}.apk`,
    },
    {
      label: 'universal release APK',
      sourcePath: join(androidOutputDir, 'apk/universal/release/app-universal-release.apk'),
      targetName: `echo-trails-release-${version}.apk`,
    },
  ];

  const apkArtifact = apkCandidates.find((item) => existsSync(item.sourcePath));

  if (!apkArtifact) {
    console.error('❌ Release APK not found.');
    console.error('   Expected one of:');
    for (const item of apkCandidates) {
      console.error(`   - ${item.sourcePath}`);
    }
    process.exit(1);
  }

  if (apkArtifact.label.includes('universal')) {
    console.warn('⚠️  Using universal APK fallback. For a smaller release APK, build with: tauri android build --target aarch64 --split-per-abi --apk true --aab true');
  }

  const optionalArtifacts: Artifact[] = [
    {
      label: 'arm64 release AAB',
      sourcePath: join(androidOutputDir, 'bundle/arm64Release/app-arm64-release.aab'),
      targetName: `echo-trails-release-${version}.aab`,
    },
    {
      label: 'universal release AAB',
      sourcePath: join(androidOutputDir, 'bundle/universalRelease/app-universal-release.aab'),
      targetName: `echo-trails-release-${version}.aab`,
    },
  ];

  const artifacts = [
    apkArtifact,
    ...optionalArtifacts.filter((item, index, list) => {
      if (!existsSync(item.sourcePath)) return false;
      const earlierSameExt = list
        .slice(0, index)
        .some((other) => extname(other.targetName) === extname(item.targetName) && existsSync(other.sourcePath));
      return !earlierSameExt;
    }),
  ];

  // 3. Prepare destination
  if (!existsSync(releaseDir)) {
    console.log(`ℹ️  Creating release directory: ${releaseDir}`);
    mkdirSync(releaseDir, { recursive: true });
  }

  // 4. Copy files
  try {
    for (const artifact of artifacts) {
      const targetPath = join(releaseDir, artifact.targetName);
      copyFileSync(artifact.sourcePath, targetPath);
      console.log(`✅ ${artifact.label} copied: ${targetPath} (${formatSize(targetPath)})`);
    }

    // Reveal in Finder (macOS)
    if (process.platform === 'darwin') {
      spawnSync('open', ['-R', join(releaseDir, apkArtifact.targetName)]);
    }
  } catch (error) {
    console.error('❌ Failed to copy Android release artifact:', error);
    process.exit(1);
  }
}

main();
