
import fs from 'node:fs';
import path from 'node:path';
import prompts from 'prompts';
import semver from 'semver';

const rootDir = process.cwd();
const appPackagePath = path.join(rootDir, 'packages/app/package.json');
const tauriConfPath = path.join(rootDir, 'packages/native/src-tauri/tauri.conf.json');
const cargoTomlPath = path.join(rootDir, 'packages/native/src-tauri/Cargo.toml');
const versionJsonPath = path.join(rootDir, 'packages/app/public/version.json');
const updateJsonPath = path.join(rootDir, 'packages/app/public/update.json');
const serverPackagePath = path.join(rootDir, 'packages/server/package.json');

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

  // Prompt for release description
  const descriptionRes = await prompts({
    type: 'text',
    name: 'value',
    message: 'Enter release description (optional)',
    initial: 'Maintenance update',
  });
  const description = descriptionRes.value;

  console.log(`\nUpgrading to: ${newVersion}\n`);

  // 3. Update files

  // Update packages/app/package.json
  appPkg.version = newVersion;
  fs.writeFileSync(appPackagePath, JSON.stringify(appPkg, null, 2) + '\n');
  console.log(`Updated ${path.relative(rootDir, appPackagePath)}`);

  // Update packages/server/package.json
  if (fs.existsSync(serverPackagePath)) {
    const serverPkg = JSON.parse(fs.readFileSync(serverPackagePath, 'utf-8'));
    serverPkg.version = newVersion;
    fs.writeFileSync(serverPackagePath, JSON.stringify(serverPkg, null, 2) + '\n');
    console.log(`Updated ${path.relative(rootDir, serverPackagePath)}`);
  } else {
    console.warn(`Warning: ${serverPackagePath} not found.`);
  }

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

    const platforms = ['android'];
    let updated = false;

    for (const platform of platforms) {
      if (versionData[platform]) {
        // Handle array format (new) or object format (old)
        if (Array.isArray(versionData[platform])) {
          // For version.json, we probably just want to update the latest version in place
          // OR prepend a new one? Usually version.json is for "latest" check.
          // But if it's history-aware, we should prepend.
          // User requirement: "version.json also updated to latest structure"
          // Let's assume we prepend a new entry for history.

          const currentLatest = versionData[platform][0] || {};
          const oldVersion = currentLatest.version;

          const newEntry = {
            ...currentLatest,
            version: newVersion,
            description: description || currentLatest.description,
            // Reset fields that should be new
            md5: undefined,
            downloadUrl: currentLatest.downloadUrl ? currentLatest.downloadUrl.replace(oldVersion, newVersion) : ''
          };

          versionData[platform].unshift(newEntry);
          updated = true;
        } else {
          // Old object format
          const oldVersion = versionData[platform].version;
          versionData[platform].version = newVersion;

          if (description) {
            versionData[platform].description = description;
          }

          if (versionData[platform].downloadUrl && oldVersion) {
            versionData[platform].downloadUrl = versionData[platform].downloadUrl.replace(oldVersion, newVersion);
          }
          updated = true;
        }
      }
    }

    if (updated) {
      fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2) + '\n');
      console.log(`Updated ${path.relative(rootDir, versionJsonPath)}`);
    }
  }

  // Update packages/app/public/update.json
  if (fs.existsSync(updateJsonPath)) {
    const updateData = JSON.parse(fs.readFileSync(updateJsonPath, 'utf-8'));
    const platforms = ['android'];
    let updated = false;

    for (const platform of platforms) {
      if (updateData[platform] && Array.isArray(updateData[platform])) {
        const currentLatest = updateData[platform][0] || {};
        const oldVersion = currentLatest.version;

        const newEntry = {
          ...currentLatest,
          version: newVersion,
          description: description || currentLatest.description,
          md5: undefined, // Clear MD5 for new version
          downloadUrl: currentLatest.downloadUrl ? currentLatest.downloadUrl.replace(oldVersion, newVersion) : ''
        };

        // Prepend new version
        updateData[platform].unshift(newEntry);
        updated = true;
      }
    }

    if (updated) {
      fs.writeFileSync(updateJsonPath, JSON.stringify(updateData, null, 2) + '\n');
      console.log(`Updated ${path.relative(rootDir, updateJsonPath)}`);
    }
  } else {
    console.warn(`Warning: ${updateJsonPath} not found.`);
  }

  console.log('\nUpgrade completed successfully!');
}

main().catch(console.error);
