import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import { exec } from "../db";
import { Album, AlbumStyle } from "../db/album";
import albumService from "../service/albumService"

export default function fileRouter(router: Hono<BlankEnv, BlankSchema, "/">) {
  router.post('/create', async (ctx) => {
    const { name, description, isLarge } = ctx.req.body
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
  })

  return 'album'
}
