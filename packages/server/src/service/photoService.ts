import { S3Client } from "@aws-sdk/client-s3";
import { Photo } from "../db/photo";
import type { Document } from 'mongoose'
import { createFileLink, createCoverLink, createPreviewLink } from "../lib/bitiful";
import { formatDateTitle } from "../lib/date";
const s3Client = new S3Client({
  endpoint: "https://s3.bitiful.net",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  region: 'ap-northeast-1'
});

async function parsePhoto(photo: Document<unknown, any, Photo>) {
  const parseData = photo.toJSON()
  return {
    ...parseData,
    // 生成链接
    url: await createFileLink(parseData.key, s3Client),
    cover: await createCoverLink(parseData.key, s3Client),
    preview: await createPreviewLink(parseData.key, s3Client),
    category: formatDateTitle(parseData.lastModified)
  }
}
export default {
  parsePhoto
}
