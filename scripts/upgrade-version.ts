
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import prompts from 'prompts';
import semver from 'semver';

const rootDir = process.cwd();
const appPackagePath = path.join(rootDir, 'packages/app/package.json');
const tauriConfPath = path.join(rootDir, 'packages/native/src-tauri/tauri.conf.json');
const cargoTomlPath = path.join(rootDir, 'packages/native/src-tauri/Cargo.toml');
const versionJsonPath = path.join(rootDir, 'packages/app/public/version.json');

async function main() {
  // 1. Read current version from packages/app/package.json
  if (!fs.existsSync(appPackagePath)) {
    console.error(`Error: Could not find ${appPackagePath}`);
    process.exit(1);
  }

  const appPkg = JSON.parse(fs.readFileSync(appPackagePath, 'utf-8'));
  const currentVersion = appPkg.version;

  if (!semver.valid(currentVersion)) {
    console.error(`Error: Current version ${currentVersion} is invalid.`);
    process.exit(1);
  }

  console.log(`Current version: ${currentVersion}`);

  // 2. Prompt for new version
  const patch = semver.inc(currentVersion, 'patch');
  const minor = semver.inc(currentVersion, 'minor');
  const major = semver.inc(currentVersion, 'major');

  const response = await prompts({
    type: 'select',
    name: 'value',
    message: 'Select release type',
    choices: [
      { title: `Patch (${patch})`, value: patch },
      { title: `Minor (${minor})`, value: minor },
      { title: `Major (${major})`, value: major },
      { title: 'Custom', value: 'custom' },
    ],
  });

  let newVersion = response.value;

  if (!newVersion) {
    console.log('Operation cancelled.');
    process.exit(0);
  }

  if (newVersion === 'custom') {
    const customRes = await prompts({
      type: 'text',
      name: 'value',
      message: 'Enter custom version',
      validate: (value) => semver.valid(value) ? true : 'Invalid semver version',
    });
    newVersion = customRes.value;
  }

  if (!newVersion) {
    console.log('Operation cancelled.');
    process.exit(0);
  }

  console.log(`\nUpgrading to: ${newVersion}\n`);

  // 3. Update files

  // Update packages/app/package.json
  appPkg.version = newVersion;
  fs.writeFileSync(appPackagePath, JSON.stringify(appPkg, null, 2) + '\n');
  console.log(`Updated ${path.relative(rootDir, appPackagePath)}`);

  // Update packages/native/src-tauri/tauri.conf.json
  if (fs.existsSync(tauriConfPath)) {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'));
    tauriConf.version = newVersion;
    fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
    console.log(`Updated ${path.relative(rootDir, tauriConfPath)}`);
  } else {
    console.warn(`Warning: ${tauriConfPath} not found.`);
  }

  // Update packages/native/src-tauri/Cargo.toml
  if (fs.existsSync(cargoTomlPath)) {
    let cargoToml = fs.readFileSync(cargoTomlPath, 'utf-8');
    // Replace version = "x.y.z" with new version
    // Use regex to find the version field under [package] or just the first occurrence
    // Assuming standard Cargo.toml structure where [package] is at the top
    const versionRegex = /^version\s*=\s*".*"/m;
    if (versionRegex.test(cargoToml)) {
      cargoToml = cargoToml.replace(versionRegex, `version = "${newVersion}"`);
      fs.writeFileSync(cargoTomlPath, cargoToml);
      console.log(`Updated ${path.relative(rootDir, cargoTomlPath)}`);
    } else {
      console.warn(`Warning: Could not find version field in ${cargoTomlPath}`);
    }
  } else {
    console.warn(`Warning: ${cargoTomlPath} not found.`);
  }

  // Update packages/app/public/version.json
  if (fs.existsSync(versionJsonPath)) {
    const versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));

    // Update top level version if exists, or just ensure structure
    // Based on previous context, we might want to update specific platform versions
    // But usually version.json tracks the latest version.
    // Let's assume we update all platforms to the new version for now,
    // or just a global version field if it exists.

    // Looking at previous user edits, the structure seems to be:
    // { "macos": { "version": "...", "url": "..." }, ... }

    const platforms = ['android'];
    let updated = false;

    for (const platform of platforms) {
      if (versionData[platform]) {
        versionData[platform].version = newVersion;
        updated = true;
      }
    }

    // If no platform specific data, maybe it's a simple structure?
    // Let's also check for a root 'version' key just in case.
    if (versionData.version) {
      versionData.version = newVersion;
      updated = true;
    }

    if (updated) {
      fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2) + '\n');
      console.log(`Updated ${path.relative(rootDir, versionJsonPath)}`);
    } else {
      console.log(`No version fields found to update in ${path.relative(rootDir, versionJsonPath)}`);
    }
  } else {
    console.warn(`Warning: ${versionJsonPath} not found.`);
  }

  // 4. Git Tag Prompt
  const tagRes = await prompts({
    type: 'confirm',
    name: 'value',
    message: `Create git tag v${newVersion}?`,
    initial: true,
  });

  if (tagRes.value) {
    try {
      // Commit all changes
      execSync('git add -A', { stdio: 'inherit' });
      execSync(`git commit -m "chore(release): v${newVersion}"`, { stdio: 'inherit' });
      console.log(`Committed changes: chore(release): v${newVersion}`);

      execSync(`git tag v${newVersion}`, { stdio: 'inherit' });
      console.log(`Git tag v${newVersion} created.`);

      const pushRes = await prompts({
        type: 'confirm',
        name: 'value',
        message: `Push tag to remote?`,
        initial: true,
      });

      if (pushRes.value) {
        execSync(`git push origin v${newVersion}`, { stdio: 'inherit' });
        console.log(`Git tag v${newVersion} pushed.`);
      }

    } catch (error) {
      console.error('Error creating/pushing git tag:', error);
    }
  }

  console.log('\nUpgrade completed successfully!');
}

main().catch(console.error);
