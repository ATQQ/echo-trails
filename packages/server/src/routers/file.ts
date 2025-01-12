import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Photo } from "../db/photo";
import { exec } from "../db";
import photoService from "../service/photoService";
import { s3Client } from "../lib/bitiful";
import { formatSize } from "../lib/file";

function replaceNullKeys(obj: any) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const newObj: any = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = key.replace(/\u0000/g, '');
      newObj[newKey] = replaceNullKeys(obj[key]);
    }
  }

  return newObj;
}

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
    const { key, exif = {}, size, name, lastModified, type, albumId, likedMode } = await ctx.req.json()
    const fileType = exif['FileType']?.value || 'unknown'
    const width = exif['Image Width']?.value || 0
    const height = exif['Image Height']?.value || 0
    const username = ctx.get('username')
    const operator = ctx.get('operator')

    if (!username) {
      return ctx.json({
        code: 1,
        message: 'username is required'
      })
    }
    const payload = {
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
      exif: replaceNullKeys(exif),
      deleted: false,
      type,
      createdBy: operator,
      updatedBy: operator,
      isLiked: !!likedMode,
      ...((albumId && Array.isArray(albumId)) ? { albumId } : {})
    }

    const photo = new Photo(payload)
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

    const { pageSize = 20, page = 1, likedMode, albumId } = ctx.req.query()
    const isLiked = likedMode === 'true'
    const skip = (+page - 1) * +pageSize;
    const photos = await exec(() => {
      return Photo.find({
        username,
        deleted: false,
        ...(isLiked ? { isLiked } : {}),
        ...(albumId ? { albumId } : {})
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
    const operator = ctx.get('operator')

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
      photo.updatedBy = operator
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
    const operator = ctx.get('operator')

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
      photo.updatedBy = operator
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
    const operator = ctx.get('operator')

    if (!Array.isArray(albumIds)) {
      return ctx.json({
        code: 1,
        message: 'albumIds should be an array'
      })
    }
    await exec(async () => {
      const photo = await Photo.findById(id, ['albumId'], {
        username
      })
      if (!photo) {
        return ctx.json({
          code: 1,
          message: 'photo not found'
        })
      }
      photo.albumId = albumIds
      photo.updatedBy = operator
      await photo.save()
    })

    return ctx.json({
      code: 0,
      message: 'update success'
    })
  })

  router.put('photos/update/albums', async (ctx) => {
    const { ids, albumIds } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')

    if (!Array.isArray(albumIds) || !Array.isArray(ids)) {
      return ctx.json({
        code: 1,
        message: 'albumIds or ids should be an array'
      })
    }
    await exec(async () => {
      const photos = await Photo.find({ _id: { $in: ids } }, ['albumId'], {
        username
      })
      if (!photos.length) {
        return ctx.json({
          code: 1,
          message: 'photos not found'
        })
      }
      for (const photo of photos) {
        // 去重
        const newAlbumIds = albumIds.filter(v => !photo?.albumId?.includes(v))
        photo.albumId = newAlbumIds.concat(photo.albumId || [])
        photo.updatedBy = operator
      }
      await Promise.all(photos.map(v => v.save()))
    })

    return ctx.json({
      code: 0,
      message: 'update success'
    })
  })

  router.delete('photo/delete', async (ctx) => {
    const { id } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')
    await exec(async () => {
      const photo = await Photo.findById(id, ['key'], {
        username
      })
      if (!photo) {
        return ctx.json({
          code: 1,
          message: 'photo not found'
        })
      }
      photo.deletedAt = new Date()
      photo.deleted = true
      photo.updatedBy = operator
      await photo.save()
      // const deleteCmd = new PutObjectCommand({
      //   Bucket: process.env.S3_BUCKET,
      //   Key: photo.key,
      // });
      // await s3Client.send(deleteCmd)
    })

    return ctx.json({
      code: 0,
      message: 'delete success'
    })
  })


  router.get('photo/listInfo', async (ctx) => {
    const username = ctx.get('username')
    const { likedMode, albumId } = ctx.req.query()
    const isLiked = likedMode === 'true'
    const photos = await exec(() => {
      return Photo.find({
        username,
        deleted: false,
        ...(isLiked ? { isLiked } : {}),
        ...(albumId ? { albumId } : {})
      })
        .select(['size'])
        .exec()
    })
    if (!photos) {
      return ctx.json({
        code: 1,
        message: 'query error'
      })
    }

    const sumCount = photos.length
    const sumSize = photos.reduce((acc, cur) => acc + cur.size, 0)
    const data = [
      { title: '数量', value: sumCount },
      {
        title: '总大小', value: formatSize(
          sumSize
        ),
        label: sumCount ? `平均大小：${formatSize(sumSize / sumCount)}` : ''
      }
    ]
    return ctx.json({
      data
    })
  })

  return 'file'
}
