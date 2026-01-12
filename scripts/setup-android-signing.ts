
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import prompts from 'prompts';

const rootDir = process.cwd();
const androidAppDir = path.join(rootDir, 'packages/native/src-tauri/gen/android/app');
const keystoreDir = path.join(androidAppDir, 'keystore');
const keyPropertiesPath = path.join(androidAppDir, 'key.properties');
const keystorePath = path.join(keystoreDir, 'release.jks');

async function main() {
  console.log('Setup Android Release Signing');
  console.log('-----------------------------');

  // Ensure directories exist
  if (!fs.existsSync(keystoreDir)) {
    fs.mkdirSync(keystoreDir, { recursive: true });
  }

  // Check if keystore already exists
  if (fs.existsSync(keystorePath)) {
    const response = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: 'Keystore already exists. Do you want to overwrite it?',
      initial: false
    });

    if (!response.overwrite) {
      console.log('Skipping keystore generation.');
      return;
    }
  }

  // Prompt for Keystore details
  const details = await prompts([
    {
      type: 'password',
      name: 'password',
      message: 'Enter Keystore password:',
      validate: value => value.length >= 6 ? true : 'Password must be at least 6 characters'
    },
    {
      type: 'text',
      name: 'alias',
      message: 'Enter Key Alias:',
      initial: 'key0'
    },
    {
      type: 'text',
      name: 'commonName',
      message: 'First and Last Name (CN):',
      initial: 'Echo Trails'
    },
    {
      type: 'text',
      name: 'organizationUnit',
      message: 'Organizational Unit (OU):',
      initial: 'Mobile'
    },
    {
      type: 'text',
      name: 'organization',
      message: 'Organization (O):',
      initial: 'Echo Trails'
    },
    {
      type: 'text',
      name: 'city',
      message: 'City or Locality (L):',
      initial: 'Unknown'
    },
    {
      type: 'text',
      name: 'state',
      message: 'State or Province (ST):',
      initial: 'Unknown'
    },
    {
      type: 'text',
      name: 'countryCode',
      message: 'Country Code (C):',
      initial: 'XX',
      validate: value => value.length === 2 ? true : 'Must be 2 letters'
    }
  ]);

  if (!details.password) {
    console.log('Operation cancelled.');
    return;
  }

  const dname = `CN=${details.commonName}, OU=${details.organizationUnit}, O=${details.organization}, L=${details.city}, ST=${details.state}, C=${details.countryCode}`;

  try {
    // Generate Keystore
    console.log('Generating Keystore...');
    const command = `keytool -genkey -v -keystore "${keystorePath}" -keyalg RSA -keysize 2048 -validity 10000 -alias "${details.alias}" -dname "${dname}" -storepass "${details.password}" -keypass "${details.password}"`;
    
    execSync(command, { stdio: 'inherit' });
    console.log(`Keystore generated at: ${keystorePath}`);

    // Create key.properties
    const propertiesContent = `storePassword=${details.password}
keyPassword=${details.password}
keyAlias=${details.alias}
storeFile=keystore/release.jks
`;
    fs.writeFileSync(keyPropertiesPath, propertiesContent);
    console.log(`key.properties generated at: ${keyPropertiesPath}`);

    console.log('\nSuccess! Android release signing configured.');
    console.log('You can now run "npm run build:android" to generate a signed APK.');

  } catch (error) {
    console.error('Error generating keystore:', error);
    console.log('Make sure "keytool" is in your PATH (included in Java JDK).');
  }
}

main().catch(console.error);
