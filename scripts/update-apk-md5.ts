
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const versionPath = path.resolve(__dirname, '../packages/app/public/version.json');
const updateJsonPath = path.resolve(__dirname, '../packages/app/public/update.json');
const apkDir = path.resolve(__dirname, '../packages/native/src-tauri/gen/android/app/build/outputs/apk/universal/release');

// Find the APK file
function findApkFile(dir: string): string | null {
    if (!fs.existsSync(dir)) {
        console.error(`Directory not found: ${dir}`);
        return null;
    }
    const files = fs.readdirSync(dir);
    // Sort by modification time, newest first
    const apkFiles = files
        .filter(f => f.endsWith('.apk') && !f.endsWith('-unaligned.apk'))
        .map(f => ({
            name: f,
            time: fs.statSync(path.join(dir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

    if (apkFiles.length === 0) {
        return null;
    }
    return path.join(dir, apkFiles[0].name);
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
    const apkPath = findApkFile(apkDir);

    if (!apkPath) {
        console.error('No APK file found in release directory.');
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
