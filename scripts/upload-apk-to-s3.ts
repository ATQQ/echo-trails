
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import prompts from 'prompts';

// Load .bitiful.env manually
const envPath = path.join(process.cwd(), '.bitiful.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf-8');
  envConfig.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
  console.log(`Loaded configuration from ${envPath}`);
} else {
  console.warn(`Warning: .bitiful.env file not found at ${envPath}. Expecting environment variables to be set otherwise.`);
}

const config = {
  accessKey: process.env.S3_ACCESS_KEY,
  secretKey: process.env.S3_SECRET_KEY,
  bucket: process.env.S3_BUCKET,
  region: process.env.S3_REGION || 'cn-east-1',
  endpoint: process.env.S3_ENDPOINT || 'https://s3.bitiful.net',
};

if (!config.accessKey || !config.secretKey || !config.bucket) {
  console.error('Error: Missing S3 configuration.');
  console.error('Please ensure .bitiful.env exists with S3_ACCESS_KEY, S3_SECRET_KEY, and S3_BUCKET.');
  process.exit(1);
}

const s3Client = new S3Client({
  endpoint: config.endpoint,
  credentials: {
    accessKeyId: config.accessKey,
    secretAccessKey: config.secretKey,
  },
  region: config.region,
});

async function main() {
  const releaseDir = path.join(process.cwd(), 'release');

  if (!fs.existsSync(releaseDir)) {
      console.error(`Error: Release directory not found at ${releaseDir}`);
      process.exit(1);
  }

  const files = fs.readdirSync(releaseDir).filter(f => f.endsWith('.apk'));

  if (files.length === 0) {
    console.log('No APK files found in release directory.');
    return;
  }

  const response = await prompts({
    type: 'select',
    name: 'file',
    message: 'Select an APK to upload to S3',
    choices: files.map(f => ({ title: f, value: f })),
  });

  if (!response.file) {
    console.log('No file selected.');
    return;
  }

  const fileName = response.file;
  const filePath = path.join(releaseDir, fileName);
  const fileContent = fs.readFileSync(filePath);
  const key = `echo-trails/release/${fileName}`;

  console.log(`Uploading ${fileName} to ${config.bucket} (Key: ${key})...`);

  try {
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: fileContent,
      ContentType: 'application/vnd.android.package-archive',
    });

    await s3Client.send(command);
    console.log(`✅ Successfully uploaded ${fileName} to S3.`);

    // Construct a public URL if possible (assuming standard Bitiful/S3 structure)
    // If endpoint is s3.bitiful.net, public URL might be different or dependent on domain config.
    // We'll just show the location.
    console.log(`Location: ${config.endpoint}/${config.bucket}/${key}`);

  } catch (error) {
    console.error('❌ Upload failed:', error);
  }
}

main();
