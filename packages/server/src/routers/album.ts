import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import { exec } from "../db";
import { Album, AlbumStyle } from "../db/album";
import albumService from "../service/albumService"

export default function albumRouter(router: Hono<BlankEnv, BlankSchema, "/">) {
  router.post('/create', async (ctx) => {
    const { name, description, isLarge } = await ctx.req.json()
    const username = ctx.get('username')

    const newAlbum = exec(async () => {
      const album = new Album({
        name,
        username,
        description,
        style: isLarge ? AlbumStyle.Large : AlbumStyle.Small,
      })
      await album.save()
      return albumService.parseAlbum(album)
    })

    return ctx.json({
      code: 0,
      data: newAlbum,
    })
  })

  router.get('/list', async (ctx) => {
    const username = ctx.get('username')

    const albums = await exec(async () => {
      const albums = await Album.find({ username, deleted: false })
      return await Promise.all(albums.map(albumService.parseAlbum))
    }) || []

    const emptyAlbums = albums.filter((album) => album.count === 0)
    const nonEmptyAlbums = albums.filter((album) => album.count > 0)
    return ctx.json({
      code: 0,
      data: Object.groupBy(nonEmptyAlbums.concat(emptyAlbums), (v) => v.style),
    })
  })

  router.get('/info', async (ctx) => {
    const { id } = ctx.req.query()
    const username = ctx.get('username')

    const album = await exec(async () => {
      const album = await Album.findOne({ _id: id, username, deleted: false })
      return album && albumService.parseAlbum(album)
    })
    return ctx.json({
      code: 0,
      data: album,
    })
  })

  router.put('/update/cover', async (ctx) => {
    const { id, key } = await ctx.req.json()
    const username = ctx.get('username')

    const updatedAlbum = await exec(async () => {
      const album = await Album.findOneAndUpdate({ _id: id, username, deleted: false }, { $set: { coverKey: key } }, { new: true })
      return album && albumService.parseAlbum(album)
    })

    return ctx.json({
      code: 0,
      data: updatedAlbum,
    })
  })

  router.put('/update', async (ctx) => {
    const { id, isLarge, ...ops } = await ctx.req.json()
    const username = ctx.get('username')

    const updatedAlbum = await exec(async () => {
      const album = await Album.findOneAndUpdate({
        _id: id, username, deleted: false
      }, {
        $set: {
          style: isLarge ? AlbumStyle.Large : AlbumStyle.Small,
          ...ops
        }
      }, { new: true })
      return album && albumService.parseAlbum(album)
    })

    return ctx.json({
      code: 0,
      data: updatedAlbum,
    })
  })

  return 'album'
}
