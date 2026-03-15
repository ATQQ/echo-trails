import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Photo } from "../db/photo";
import photoService from "../service/photoService";
import { bitifulS3Manager, bitifulConfig } from "../lib/bitiful";
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
      Bucket: bitifulConfig.bucket,
      Key: key
    });
    //获取签名
    const url = await getSignedUrl(bitifulS3Manager.getClient(), putCmd, { expiresIn: 3600 })
    return ctx.json({
      url
    })
  })

  router.post('add/info', async (ctx) => {
    const { key, exif = {}, size, name, lastModified, type, albumId, likedMode, md5 } = await ctx.req.json()
    const fileType = exif['FileType']?.value
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
      bucket: bitifulConfig.bucket,
      // 不保留用不到的信息
      exif: {
        FileType: fileType,
        'Image Width': width,
        'Image Height': height,
      },
      deleted: false,
      type,
      createdBy: operator,
      updatedBy: operator,
      isLiked: !!likedMode,
      md5: md5 || '',
      ...((albumId && Array.isArray(albumId)) ? { albumId } : {})
    }

    const photo = new Photo(payload)
    await photo.save()
    const addData = await photoService.parsePhoto(photo)

    return ctx.json({
      code: 0,
      data: addData
    })
  })

  router.put('update/info', async (ctx) => {
    const { id, lastModified, albumId, likedMode, exif = {} } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')

    const photo = await Photo.findById(id, null, {
      username
    })

    if (!photo) {
      return ctx.json({
        code: 1,
        message: 'photo not found'
      })
    }

    const fileType = exif['FileType']?.value
    const width = exif['Image Width']?.value || 0
    const height = exif['Image Height']?.value || 0

    photo.lastModified = new Date(lastModified)
    photo.isLiked = !!likedMode
    photo.updatedBy = operator
    if (albumId && Array.isArray(albumId)) {
      // Merge albumIds instead of replacing
      const existingAlbumIds = photo.albumId || []
      const newAlbumIds = albumId.filter((id: string) => !existingAlbumIds.includes(id))
      photo.albumId = [...existingAlbumIds, ...newAlbumIds]
    }
    
    // Update exif related info if provided
    if (Object.keys(exif).length > 0) {
      photo.exif = {
        FileType: fileType,
        'Image Width': width,
        'Image Height': height,
      }
      if (fileType) photo.fileType = fileType
      if (width) photo.width = width
      if (height) photo.height = height
    }

    await photo.save()
    const updatedData = await photoService.parsePhoto(photo)

    return ctx.json({
      code: 0,
      data: updatedData
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

    const { pageSize = 20, page = 1, likedMode, albumId, isDelete, type } = ctx.req.query()
    const isLiked = likedMode === 'true'
    const skip = (+page - 1) * +pageSize;
    const query: any = {
      username,
      deleted: !!isDelete,
      ...(isLiked ? { isLiked } : {}),
      ...(albumId ? { albumId } : {}),
    }

    if (type) {
      query.type = { $regex: new RegExp(`^${type}/`) }
    } else {
      query.type = { $regex: new RegExp('^image/') }
    }

    const photos = await Photo.find(query).skip(skip)
      .limit(+pageSize)
      .select(['key', 'uploadDate', 'lastModified', 'name', 'size', 'width', 'height', 'fileType', 'description', 'type', 'isLiked', 'albumId', 'md5'])
      .sort({
        lastModified: -1
      })
      .exec()

    if (!photos) {
      return ctx.json({
        code: 1,
        message: 'query error'
      })
    }
    const data = await Promise.all(photos.map(async (photo) => {
      return await photoService.parsePhoto(photo)
    }))

    // 根据md5字段补全isRepeat字段
    const md5Map = new Map<string, Photo>()
    data?.forEach(photo => {
      if (!photo.md5) {
        return
      }
      if (md5Map.has(photo.md5)) {
        Object.assign(photo, { isRepeat: true })
      } else {
        md5Map.set(photo.md5, photo)
      }
    })

    return ctx.json({
      data
    })
  })


  router.put('photo/update/description', async (ctx) => {
    const { id, description } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')

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

    return ctx.json({
      code: 0,
      message: 'update success'
    })
  })

  router.put('photo/update/like', async (ctx) => {
    const { id } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')

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

    return ctx.json({
      code: 0,
      message: 'update success'
    })
  })

  router.delete('photo/delete', async (ctx) => {
    const { id, albumId } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')
    const photo = await Photo.findById(id, ['key', 'albumId'], {
      username
    })
    if (!photo) {
      return ctx.json({
        code: 1,
        message: 'photo not found'
      })
    }
    
    if (albumId) {
      // If deleting from a specific album
      if (photo.albumId && photo.albumId.includes(albumId)) {
        photo.albumId = photo.albumId.filter(aid => aid !== albumId)
        
        // If no albums left, mark as deleted
        if (photo.albumId.length === 0) {
          photo.deletedAt = new Date()
          photo.deleted = true
        }
      }
    } else {
      // Default behavior: delete the photo
      photo.deletedAt = new Date()
      photo.deleted = true
    }
    
    photo.updatedBy = operator
    await photo.save()
    // const deleteCmd = new PutObjectCommand({
    //   Bucket: process.env.S3_BUCKET,
    //   Key: photo.key,
    // });
    // await s3Client.send(deleteCmd)

    return ctx.json({
      code: 0,
      message: 'delete success'
    })
  })

  router.delete('photos/delete', async (ctx) => {
    const { ids, albumId } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')
    const photos = await Photo.find({
      _id: {
        $in: ids
      }
    }, ['key', 'albumId'], {
      username
    })
    if (!photos.length) {
      return ctx.json({
        code: 1,
        message: 'photos not found'
      })
    }

    for (const photo of photos) {
      if (albumId) {
        // If deleting from a specific album
        if (photo.albumId && photo.albumId.includes(albumId)) {
          photo.albumId = photo.albumId.filter(aid => aid !== albumId)
          
          // If no albums left, mark as deleted
          if (photo.albumId.length === 0) {
            photo.deletedAt = new Date()
            photo.deleted = true
          }
        }
      } else {
        // Default behavior: delete the photo
        photo.deletedAt = new Date()
        photo.deleted = true
      }
      photo.updatedBy = operator
    }
    await Promise.all(photos.map(v => v.save()))
    // const deleteCmd = new PutObjectCommand({
    //   Bucket: process.env.S3_BUCKET,
    //   Key: photo.key,
    // });
    // await s3Client.send(deleteCmd)

    return ctx.json({
      code: 0,
      message: 'delete success'
    })
  })

  router.put('photos/restore', async (ctx) => {
    const { ids } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')

    const photos = await Photo.find({
      _id: {
        $in: ids
      },
      deleted: true
    }, ['key'], {
      username
    })
    if (!photos.length) {
      return ctx.json({
        code: 1,
        message: 'photos not found'
      })
    }

    for (const photo of photos) {
      // 标志是被删除过
      // photo.deletedAt = null
      photo.deleted = false
      photo.updatedBy = operator

      // TODO：完整的操作日志
    }
    await Promise.all(photos.map(v => v.save()))

    return ctx.json({
      code: 0,
      message: 'restore success'
    })
  })

  router.get('photo/listInfo', async (ctx) => {
    const username = ctx.get('username')
    const { likedMode, albumId, isDelete, type } = ctx.req.query()
    const isLiked = likedMode === 'true'
    const query: any = {
      username,
      deleted: !!isDelete,
      ...(isLiked ? { isLiked } : {}),
      ...(albumId ? { albumId } : {})
    }

    if (type) {
      query.type = { $regex: new RegExp(`^${type}/`) }
    }

    const photos = await Photo.find(query)
      .select(['size'])
      .exec()
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

  router.get('check/duplicate', async (ctx) => {
    const md5 = ctx.req.query('md5')
    const username = ctx.get('username')

    if (!md5) {
      return ctx.json({
        code: 1,
        message: 'md5 is required'
      })
    }

    if (!username) {
      return ctx.json({
        code: 1,
        message: 'username is required'
      })
    }

    const existingPhoto = await Photo.findOne({
      username,
      md5,
      deleted: false
    }).select(['_id', 'key']).exec()

    return ctx.json({
      code: 0,
      data: {
        isDuplicate: !!existingPhoto,
        existingPhoto: existingPhoto ? {
          _id: existingPhoto._id,
          key: existingPhoto.key
        } : null
      }
    })
  })

  return 'file'
}
