import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Photo } from "../db/photo";
import { exec } from "../db";
import { createCoverLink, createFileLink, createPreviewLink } from "../lib/bitiful";
import { formatDateTitle } from "../lib/date";


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
    const key = ctx.req.query('key')
    if (!key) {
      return ctx.json({
        code: 1,
        message: 'key is required'
      })
    }
    const putCmd = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key
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
    const username = ctx.get('username')
    if (!username) {
      return ctx.json({
        code: 1,
        message: 'username is required'
      })
    }

    const photo = new Photo({
      username,
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
      deleted: false,
      type
    })
    await exec(async () => {
      await photo.save()
    })

    return ctx.json({
      code: 0
    })
  })

  router.get('photo/list', async (ctx) => {
    const username = ctx.get('username')

    if (!username) {
      return ctx.json({
        code: 1,
        message: 'username is required'
      })
    }

    const { pageSize = 20, page = 1 } = ctx.req.query()
    const skip = (+page - 1) * +pageSize;
    const photos = await exec(() => {
      return Photo.find({
        username,
        deleted: false
      }).skip(skip)
        .limit(+pageSize)
        .select(['key', 'uploadDate', 'lastModified', 'name', 'size', 'width', 'height', 'fileType'])
        .sort({
          lastModified: -1
        })
        .exec()
    })
    if (!photos) {
      return ctx.json({
        code: 1,
        message: 'query error'
      })
    }
    const data = await Promise.all(photos.map(async (photo) => {
      return {
        ...photo.toJSON(),
        // 生成链接
        url: await createFileLink(photo.key, s3Client),
        cover: await createCoverLink(photo.key, s3Client),
        preview: await createPreviewLink(photo.key, s3Client),
        category: formatDateTitle(photo.lastModified)
      }
    }))

    return ctx.json({
      data
    })
  })

  return 'file'
}
