import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import { Album, AlbumStyle } from "../db/album";
import albumService from "../service/albumService"
import { Photo } from "../db/photo";
import { createAlbumLink, createCoverLink } from "../lib/bitiful";

export default function albumRouter(router: Hono<BlankEnv, BlankSchema, "/">) {
  router.post('/create', async (ctx) => {
    const { name, description, isLarge, tags } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')

    const album = new Album({
      name,
      username,
      description,
      createdBy: operator,
      updatedBy: operator,
      style: isLarge ? AlbumStyle.Large : AlbumStyle.Small,
      tags: Array.isArray(tags) ? tags : [],
    })
    await album.save()
    const newAlbum = await albumService.parseAlbum(album)

    return ctx.json({
      code: 0,
      data: newAlbum,
    })
  })

  router.get('/list', async (ctx) => {
    const username = ctx.get('username')

    // 优化：使用聚合查询一次性获取所有相册的统计信息，避免N+1查询
    const albums = await Album.find({ username, deleted: false }).sort({ createdAt: -1 }).lean()
    const albumIds = albums.map(a => a._id.toString())

    const stats = await Photo.aggregate([
      {
        $match: {
          username,
          deleted: false,
          albumId: { $in: albumIds }
        }
      },
      { $unwind: "$albumId" },
      { $match: { albumId: { $in: albumIds } } },
      // 按最后修改时间倒序，确保 firstKey 取到的是最新的照片
      { $sort: { lastModified: -1 } },
      {
        $group: {
          _id: "$albumId",
          count: { $sum: 1 },
          firstKey: { $first: "$key" }
        }
      }
    ])

    const statsMap = new Map(stats.map(s => [s._id, s]))

    const parsedAlbums = await Promise.all(albums.map(async (album) => {
      const idStr = album._id.toString()
      const stat = statsMap.get(idStr) || { count: 0, firstKey: null }

      const { name, description, coverKey, style, createdAt, tags } = album
      const count = stat.count

      const coverFn = style === AlbumStyle.Large ? createAlbumLink : createCoverLink

      // 封面逻辑：优先使用设定的封面，否则使用第一张照片
      let keyToUse = ''
      if (count > 0) {
          if (coverKey) keyToUse = coverKey
          else if (stat.firstKey) keyToUse = stat.firstKey
      }

      const cover = keyToUse ? await coverFn(keyToUse) : ''

      return {
        _id: album._id,
        name,
        description,
        count,
        style: style === AlbumStyle.Large ? 'large' : 'small',
        cover,
        coverKey,
        createdAt,
        tags: tags || []
      }
    })) || []

    const emptyAlbums = parsedAlbums.filter((album) => album.count === 0)
    const nonEmptyAlbums = parsedAlbums.filter((album) => album.count > 0)
    return ctx.json({
      code: 0,
      // @ts-expect-error
      data: Object.groupBy(nonEmptyAlbums.concat(emptyAlbums), (v) => v.style),
    })
  })

  router.get('/info', async (ctx) => {
    const { id } = ctx.req.query()
    const username = ctx.get('username')

    const album = await Album.findOne({ _id: id, username, deleted: false })
    const data = album && await albumService.parseAlbum(album)
    return ctx.json({
      code: 0,
      data: data,
    })
  })

  router.put('/update/cover', async (ctx) => {
    const { id, key } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')

    const album = await Album.findOneAndUpdate({ _id: id, username, deleted: false }, { $set: { coverKey: key, updatedBy: operator } }, { new: true })
    const updatedAlbum = album && await albumService.parseAlbum(album)

    return ctx.json({
      code: 0,
      data: updatedAlbum,
    })
  })

  router.put('/update', async (ctx) => {
    const { id, isLarge, tags, ...ops } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')

    const updateData: any = {
      updatedBy: operator,
      style: isLarge ? AlbumStyle.Large : AlbumStyle.Small,
      ...ops
    }
    if (tags && Array.isArray(tags)) {
      updateData.tags = tags
    }

    const album = await Album.findOneAndUpdate({
      _id: id, username, deleted: false
    }, {
      $set: updateData
    }, { new: true })
    const updatedAlbum = album && await albumService.parseAlbum(album)

    return ctx.json({
      code: 0,
      data: updatedAlbum,
    })
  })

  return 'album'
}
