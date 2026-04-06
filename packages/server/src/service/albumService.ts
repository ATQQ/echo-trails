import { Album, AlbumStyle } from "../db/album";
import type { Document } from 'mongoose'
import { Photo } from "../db/photo";
import { createAlbumLink, createCoverLink } from "../lib/bitiful";

async function parseAlbum(album: Document<unknown, any, Album>) {
  const { _id, name, description, coverKey, style, username, createdAt, tags } = album.toJSON()
  const photos = await Photo.find({
    username,
    deleted: false,
    albumId: _id
  }, ['key']) || []
  const count = photos.length
  
  // 如果相册包含标签，则使用 createCoverLink 以保证显示更清晰，否则按原逻辑
  let coverFn = style === AlbumStyle.Large ? createAlbumLink : createCoverLink
  if (tags && tags.length > 0) {
    coverFn = createCoverLink
  }
  
  const cover = (coverKey && count) ? await coverFn(coverKey) : (count > 0 ? await coverFn(photos[0].key) : '')

  return {
    _id,
    name,
    description,
    count,
    style: style === AlbumStyle.Large ? 'large' : 'small',
    cover,
    coverKey,
    createdAt,
    tags: tags || []
  }
}
export default {
  parseAlbum
}
