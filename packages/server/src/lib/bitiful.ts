import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export async function createFileLink(key: string, s3Client: S3Client) {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
  })
  return getSignedUrl(s3Client, command, { expiresIn: 60 * 30 /*半小时*/ })
}

export async function createCoverLink(key: string, s3Client: S3Client) {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: `${key}!style:${process.env.BITIFUL_COVER_STYLE}`,
  })
  return getSignedUrl(s3Client, command, { expiresIn: 60 * 30 /*半小时*/ })
}

export async function createPreviewLink(key: string, s3Client: S3Client) {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: `${key}!style:${process.env.BITIFUL_PREVIEW_STTYLE}`,
  })
  return getSignedUrl(s3Client, command, { expiresIn: 60 * 30 /*半小时*/ })
}
