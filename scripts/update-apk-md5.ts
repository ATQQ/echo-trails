
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const projectRoot = path.resolve(__dirname, '..');
const versionPath = path.resolve(__dirname, '../packages/app/public/version.json');
const updateJsonPath = path.resolve(__dirname, '../packages/app/public/update.json');
const tauriConfigPath = path.resolve(projectRoot, 'packages/native/src-tauri/tauri.conf.json');
const androidOutputDir = path.resolve(projectRoot, 'packages/native/src-tauri/gen/android/app/build/outputs');
const releaseDir = path.resolve(projectRoot, 'release');

// Find the APK file
function findApkFile(): string | null {
    const version = getVersion();
    const candidates = [
        path.join(releaseDir, `echo-trails-release-${version}.apk`),
        path.join(androidOutputDir, 'apk/arm64/release/app-arm64-release.apk'),
        path.join(androidOutputDir, 'apk/universal/release/app-universal-release.apk'),
    ];

    return candidates.find(filePath => fs.existsSync(filePath)) ?? null;
}

function getVersion(): string {
    if (!fs.existsSync(tauriConfigPath)) {
        console.error(`Tauri config not found: ${tauriConfigPath}`);
        process.exit(1);
    }

    const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf-8'));
    if (!tauriConfig.version) {
        console.error('Version not found in tauri.conf.json');
        process.exit(1);
    }

    return tauriConfig.version;
}

// Calculate MD5
function calculateMd5(filePath: string): string {
    const buffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('md5');
    hash.update(buffer);
    return hash.digest('hex');
}

async function main() {
    console.log('Searching for APK...');
    const apkPath = findApkFile();

    if (!apkPath) {
        console.error('No APK file found. Run the Android build first.');
        process.exit(1);
    }

    console.log(`Found APK: ${apkPath}`);
    const md5 = calculateMd5(apkPath);
    console.log(`MD5: ${md5}`);

    // Update version.json (Old structure: object)
    if (fs.existsSync(versionPath)) {
        const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));

        if (versionData.android) {
            // Check if it's an array (new format in version.json too) or object
            if (Array.isArray(versionData.android)) {
                if (versionData.android.length > 0) {
                    versionData.android[0].md5 = md5;
                    console.log(`Updated version.json (array) with MD5: ${md5}`);
                }
            } else {
                versionData.android.md5 = md5;
                console.log(`Updated version.json (object) with MD5: ${md5}`);
            }
            fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2) + '\n');
        } else {
            console.error('No android section in version.json');
        }
    } else {
        console.error(`version.json not found at ${versionPath}`);
    }

    // Update update.json (New structure: array)
    if (fs.existsSync(updateJsonPath)) {
        const updateData = JSON.parse(fs.readFileSync(updateJsonPath, 'utf-8'));

        if (updateData.android && Array.isArray(updateData.android)) {
            if (updateData.android.length > 0) {
                // Update the latest version (first element)
                updateData.android[0].md5 = md5;
                fs.writeFileSync(updateJsonPath, JSON.stringify(updateData, null, 2) + '\n');
                console.log(`Updated update.json with MD5: ${md5}`);
            } else {
                 console.warn('android section in update.json is empty array');
            }
        } else {
            console.error('No android array section in update.json');
        }
    } else {
         // It's okay if update.json doesn't exist yet, or maybe warn
         console.warn(`update.json not found at ${updateJsonPath}`);
    }
}

main().catch(console.error);
