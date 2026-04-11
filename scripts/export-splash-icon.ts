import fs from 'node:fs';
import path from 'node:path';
import { copyFileSync, existsSync } from 'node:fs';

const rootDir = process.cwd();
const sourceIconDir = path.join(rootDir, 'sources/icon/android');
const tauriIconsDir = path.join(rootDir, 'packages/native/src-tauri/icons');
const androidAppIconDir = path.join(rootDir, 'packages/native/src-tauri/gen/android/app/src/main/res');
const appPublicDir = path.join(rootDir, 'packages/app/public');

const mappings = [
  // App Public Icons (Web & PWA)
  { src: 'mipmap-xxxhdpi/ic_launcher.png', dest: path.join(appPublicDir, 'android-chrome-512x512.png') },
  { src: 'mipmap-xxhdpi/ic_launcher.png', dest: path.join(appPublicDir, 'android-chrome-192x192.png') },
  { src: 'mipmap-xxxhdpi/ic_launcher.png', dest: path.join(appPublicDir, 'apple-touch-icon.png') },
  { src: 'mipmap-mdpi/ic_launcher.png', dest: path.join(appPublicDir, 'favicon-32x32.png') },
  { src: 'mipmap-ldpi/ic_launcher.png', dest: path.join(appPublicDir, 'favicon-16x16.png') },
  { src: 'mipmap-xhdpi/ic_launcher.png', dest: path.join(appPublicDir, 'favicon.ico') },

  // Tauri Desktop / General Icons
  { src: 'mipmap-xxxhdpi/ic_launcher.png', dest: path.join(tauriIconsDir, 'icon.png') },
  { src: 'playstore-icon.png', dest: path.join(tauriIconsDir, 'playstore-icon.png') },
  { src: 'mipmap-xxhdpi/ic_launcher.png', dest: path.join(tauriIconsDir, '192x192.png') },
  { src: 'mipmap-xhdpi/ic_launcher.png', dest: path.join(tauriIconsDir, '128x128.png') },
  { src: 'mipmap-mdpi/ic_launcher.png', dest: path.join(tauriIconsDir, '32x32.png') },
  { src: 'mipmap-ldpi/ic_launcher.png', dest: path.join(tauriIconsDir, '16x16.png') },
  { src: 'mipmap-xxxhdpi/ic_launcher.png', dest: path.join(tauriIconsDir, 'apple-touch-icon.png') },
  { src: 'mipmap-xhdpi/ic_launcher.png', dest: path.join(tauriIconsDir, 'icon.ico') },

  // Android Native Icons - ic_launcher
  { src: 'mipmap-hdpi/ic_launcher.png', dest: path.join(androidAppIconDir, 'mipmap-hdpi/ic_launcher.png') },
  { src: 'mipmap-mdpi/ic_launcher.png', dest: path.join(androidAppIconDir, 'mipmap-mdpi/ic_launcher.png') },
  { src: 'mipmap-xhdpi/ic_launcher.png', dest: path.join(androidAppIconDir, 'mipmap-xhdpi/ic_launcher.png') },
  { src: 'mipmap-xxhdpi/ic_launcher.png', dest: path.join(androidAppIconDir, 'mipmap-xxhdpi/ic_launcher.png') },
  { src: 'mipmap-xxxhdpi/ic_launcher.png', dest: path.join(androidAppIconDir, 'mipmap-xxxhdpi/ic_launcher.png') },

  // Android Native Icons - ic_launcher_foreground
  { src: 'mipmap-hdpi/ic_launcher.png', dest: path.join(androidAppIconDir, 'mipmap-hdpi/ic_launcher_foreground.png') },
  { src: 'mipmap-mdpi/ic_launcher.png', dest: path.join(androidAppIconDir, 'mipmap-mdpi/ic_launcher_foreground.png') },
  { src: 'mipmap-xhdpi/ic_launcher.png', dest: path.join(androidAppIconDir, 'mipmap-xhdpi/ic_launcher_foreground.png') },
  { src: 'mipmap-xxhdpi/ic_launcher.png', dest: path.join(androidAppIconDir, 'mipmap-xxhdpi/ic_launcher_foreground.png') },
  { src: 'mipmap-xxxhdpi/ic_launcher.png', dest: path.join(androidAppIconDir, 'mipmap-xxxhdpi/ic_launcher_foreground.png') },

  // Android Native Icons - ic_launcher_round
  { src: 'mipmap-hdpi/ic_launcher.png', dest: path.join(androidAppIconDir, 'mipmap-hdpi/ic_launcher_round.png') },
  { src: 'mipmap-mdpi/ic_launcher.png', dest: path.join(androidAppIconDir, 'mipmap-mdpi/ic_launcher_round.png') },
  { src: 'mipmap-xhdpi/ic_launcher.png', dest: path.join(androidAppIconDir, 'mipmap-xhdpi/ic_launcher_round.png') },
  { src: 'mipmap-xxhdpi/ic_launcher.png', dest: path.join(androidAppIconDir, 'mipmap-xxhdpi/ic_launcher_round.png') },
  { src: 'mipmap-xxxhdpi/ic_launcher.png', dest: path.join(androidAppIconDir, 'mipmap-xxxhdpi/ic_launcher_round.png') },
];

async function main() {
  console.log('📦 Starting to copy icons from sources...');

  if (!existsSync(sourceIconDir)) {
    console.error(`❌ Source icon directory not found: ${sourceIconDir}`);
    process.exit(1);
  }

  for (const { src, dest } of mappings) {
    const sourcePath = path.join(sourceIconDir, src);
    
    if (existsSync(sourcePath)) {
      // Ensure destination directory exists
      const destDir = path.dirname(dest);
      if (!existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      copyFileSync(sourcePath, dest);
      console.log(`✅ Copied: ${src} -> ${path.relative(rootDir, dest)}`);
    } else {
      console.warn(`⚠️  Source file missing: ${src}`);
    }
  }
  
  console.log('🎉 Icon update complete!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
