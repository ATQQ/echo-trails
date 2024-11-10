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

    return ctx.json({
      code: 0,
      data: Object.groupBy(albums, (v)=> v.style),
    })
  })

  return 'album'
}
