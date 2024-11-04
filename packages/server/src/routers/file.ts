import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Photo } from "../db/photo";
import { exec } from "../db";

const s3Client = new S3Client({
  endpoint: "https://s3.bitiful.net",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  region: 'ap-northeast-1'
});

export default function fileRouter(router: Hono<BlankEnv, BlankSchema, "/">) {
  router.get('upload/token', async (ctx) => {
    const putCmd = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: 'test/abc'
    });
    //获取签名
    const url = await getSignedUrl(s3Client, putCmd, { expiresIn: 3600 })
    return ctx.json({
      url
    })
  })

  router.post('add/info', async (ctx) => {
    const { key, exif, size, name, lastModified, type } = await ctx.req.json()
    const fileType = exif['FileType']?.value || 'unknown'
    const width = exif['Image Width']?.value || 0
    const height = exif['Image Height']?.value || 0

    const photo = new Photo({
      key,
      uploadDate: new Date(),
      lastModified: new Date(lastModified),
      name,
      size,
      width,
      height,
      fileType,
      bucket: process.env.S3_BUCKET,
      exif,
      type
    })
    await exec(async () => {
      await photo.save()
    })

    return ctx.json({
      code: 0
    })
  })

  return 'file'
}
