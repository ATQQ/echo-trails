import { Photo } from "../db/photo";
import type { Document } from 'mongoose'
import { createFileLink, createCoverLink, createPreviewLink } from "../lib/bitiful";
import { formatDateTitle } from "../lib/date";

async function parsePhoto(photo: Document<unknown, any, Photo>) {
  const parseData = photo.toJSON()
  return {
    ...parseData,
    // 生成链接
    url: await createFileLink(parseData.key),
    cover: await createCoverLink(parseData.key),
    preview: await createPreviewLink(parseData.key),
    category: formatDateTitle(parseData.lastModified)
  }
}
export default {
  parsePhoto
}
