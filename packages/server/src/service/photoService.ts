import { Photo } from "../db/photo";
import type { Document } from 'mongoose'
import { createFileLink, createCoverLink, createPreviewLink } from "../lib/bitiful";
import { formatDateTitle } from "../lib/date";

async function parsePhoto(photo: Document<unknown, any, Photo>) {
  const parseData = photo.toJSON()

  // 检查 md5 重复 - 使用高效查询，只查询必要字段
  // let isRepeat = false;
  // if (parseData.md5) {
  //   const duplicatePhoto = await exec(async () => {
  //     return Photo.findOne({
  //       md5: parseData.md5,
  //       _id: { $ne: parseData._id }, // 排除当前照片本身
  //       deleted: false // 只检查未删除的照片
  //     }, '_id').lean(); // 只查询 _id 字段，使用 lean() 提高性能
  //   });

  //   isRepeat = !!duplicatePhoto;
  // }

  // console.log('isRepeat', isRepeat)
  const isImage = parseData.type.startsWith('image/')
  return {
    ...parseData,
    // 生成链接
    url: await createFileLink(parseData.key),
    cover: await createCoverLink(parseData.key, isImage),
    preview: await createPreviewLink(parseData.key, isImage),
    category: formatDateTitle(parseData.lastModified),
    // isRepeat,
  }
}
export default {
  parsePhoto
}
