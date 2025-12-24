import { Album, AlbumStyle } from "../db/album";
import type { Document } from 'mongoose'
import { Photo } from "../db/photo";
import { createAlbumLink, createCoverLink } from "../lib/bitiful";

async function parseAlbum(album: Document<unknown, any, Album>) {
  const { _id, name, description, coverKey, style, username } = album.toJSON()
  const photos = await Photo.find({
    username,
    deleted: false,
    albumId: _id
  }, ['key']) || []
  const count = photos.length
  const coverFn = style === AlbumStyle.Large ? createAlbumLink : createCoverLink
  const cover = (coverKey && count) ? await coverFn(coverKey) : (count > 0 ? await coverFn(photos[0].key) : '')

  return {
    _id,
    name,
    description,
    count,
    style: style === AlbumStyle.Large ? 'large' : 'small',
    cover,
    coverKey,
  }
}
export default {
  parseAlbum
}
