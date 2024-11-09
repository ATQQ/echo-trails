import { Album } from "../db/album";
import type { Document } from 'mongoose'

async function parseAlbum(photo: Document<unknown, any, Album>) {
  const parseData = photo.toJSON()
  return parseData
}
export default {
  parseAlbum
}
