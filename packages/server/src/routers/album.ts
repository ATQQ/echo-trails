import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import { Album, AlbumStyle } from "../db/album";
import albumService from "../service/albumService"

export default function albumRouter(router: Hono<BlankEnv, BlankSchema, "/">) {
  router.post('/create', async (ctx) => {
    const { name, description, isLarge } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')

    const album = new Album({
      name,
      username,
      description,
      createdBy: operator,
      updatedBy: operator,
      style: isLarge ? AlbumStyle.Large : AlbumStyle.Small,
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

    const albums = await Album.find({ username, deleted: false }).sort({ createdAt: -1 })
    const parsedAlbums = await Promise.all(albums.map(albumService.parseAlbum)) || []

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
    const { id, isLarge, ...ops } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')

    const album = await Album.findOneAndUpdate({
      _id: id, username, deleted: false
    }, {
      $set: {
        updatedBy: operator,
        style: isLarge ? AlbumStyle.Large : AlbumStyle.Small,
        ...ops
      }
    }, { new: true })
    const updatedAlbum = album && await albumService.parseAlbum(album)

    return ctx.json({
      code: 0,
      data: updatedAlbum,
    })
  })

  return 'album'
}
