import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const rootDir = process.cwd();

console.log('🚀 Starting test build process...');

// 1. Automatically bump the patch version
console.log('📦 Bumping patch version...');
const upgradeResult = spawnSync('bun', ['run', 'scripts/upgrade-version.ts', '--patch', '--desc', 'Test build'], {
  stdio: 'inherit',
  cwd: rootDir
});

if (upgradeResult.status !== 0) {
  console.error('❌ Version upgrade failed.');
  process.exit(1);
}

// 2. Build the Android app
console.log('🔨 Building Android APK...');
const buildResult = spawnSync('bun', ['run', 'build:android'], {
  stdio: 'inherit',
  cwd: rootDir
});

if (buildResult.status !== 0) {
  console.error('❌ Android build failed.');
  process.exit(1);
}

// 3. Output the built APK location
const releaseDir = path.join(rootDir, 'release');
if (fs.existsSync(releaseDir)) {
  const files = fs.readdirSync(releaseDir).filter(f => f.endsWith('.apk'));
  if (files.length > 0) {
    // get the latest one by modify time
    const latestApk = files.map(f => ({
      name: f,
      path: path.join(releaseDir, f),
      time: fs.statSync(path.join(releaseDir, f)).mtime.getTime()
    })).sort((a, b) => b.time - a.time)[0];
    
    console.log(`\n✅ Test build completed successfully!`);
    console.log(`📱 The test APK is ready at:`);
    console.log(`   ${latestApk.path}`);
    
    // Optional: Reveal in Finder (macOS)
    if (process.platform === 'darwin') {
      spawnSync('open', ['-R', latestApk.path]);
    }
    
    console.log(`\n💡 You can now transfer this file to your phone for testing.`);
  }
} else {
  console.log(`\n✅ Test build completed successfully, but release directory not found.`);
}
