import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Photo } from "../db/photo";
import { exec } from "../db";
import photoService from "../service/photoService";

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
    const addData = await photoService.parsePhoto(photo)

    return ctx.json({
      code: 0,
      data: addData
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

    const { pageSize = 20, page = 1, likedMode } = ctx.req.query()
    const isLiked = likedMode === 'true'
    const skip = (+page - 1) * +pageSize;
    const photos = await exec(() => {
      return Photo.find({
        username,
        deleted: false,
        ...(isLiked ? { isLiked } : {})
      }).skip(skip)
        .limit(+pageSize)
        .select(['key', 'uploadDate', 'lastModified', 'name', 'size', 'width', 'height', 'fileType', 'description', 'type', 'isLiked', 'albumId'])
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
      return await photoService.parsePhoto(photo)
    }))

    return ctx.json({
      data
    })
  })


  router.put('photo/update/description', async (ctx) => {
    const { id, description } = await ctx.req.json()
    const username = ctx.get('username')

    await exec(async () => {
      const photo = await Photo.findById(id, ['description'], {
        username
      })
      if (!photo) {
        return ctx.json({
          code: 1,
          message: 'photo not found'
        })
      }

      photo.description = description
      await photo.save()
    })
    return ctx.json({
      code: 0,
      message: 'update success'
    })
  })

  router.put('photo/update/like', async (ctx) => {
    const { id } = await ctx.req.json()
    const username = ctx.get('username')

    await exec(async () => {
      const photo = await Photo.findById(id, ['isLiked'], {
        username
      })
      if (!photo) {
        return ctx.json({
          code: 1,
          message: 'photo not found'
        })
      }
      photo.isLiked = !photo.isLiked
      await photo.save()
    })

    return ctx.json({
      code: 0,
      message: 'update success'
    })
  })

  router.put('photo/update/album', async (ctx) => {
    const { id, albumIds } = await ctx.req.json()
    const username = ctx.get('username')
    if (!Array.isArray(albumIds)) {
      return ctx.json({
        code: 1,
        message: 'albumIds should be an array'
      })
    }
    await exec(async () => {
      const photo = await Photo.findById(id, {
        username
      })
      if (!photo) {
        return ctx.json({
          code: 1,
          message: 'photo not found'
        })
      }
      photo.albumId = albumIds
      await photo.save()
    })

    return ctx.json({
      code: 0,
      message: 'update success'
    })
  })

  return 'file'
}
