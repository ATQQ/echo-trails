import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import { Album } from "../db/album";
import { AlbumFolder } from "../db/albumFolder";

export default function albumFolderRouter(router: Hono<BlankEnv, BlankSchema, "/">) {
  // 列出当前用户名下所有未删除的文件夹
  router.get('/list', async (ctx) => {
    const username = ctx.get('username')
    const folders = await AlbumFolder.find({ username, deleted: false }).sort({ createdAt: -1 }).lean()

    // 统计每个文件夹下的相册数量
    const folderIds = folders.map(f => f._id.toString())
    const counts = await Album.aggregate([
      { $match: { username, deleted: false, folderId: { $in: folderIds } } },
      { $group: { _id: '$folderId', count: { $sum: 1 } } }
    ])
    const countMap = new Map(counts.map(c => [c._id, c.count]))

    const data = folders.map(f => ({
      _id: f._id.toString(),
      name: f.name,
      description: f.description || '',
      coverKey: f.coverKey || '',
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      albumCount: countMap.get(f._id.toString()) || 0,
    }))

    return ctx.json({ code: 0, data: data || [] })
  })

  // 创建文件夹
  router.post('/create', async (ctx) => {
    const { name, description } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')

    const folder = new AlbumFolder({
      name,
      username,
      description: description || '',
      createdBy: operator,
      updatedBy: operator,
    })
    await folder.save()

    return ctx.json({
      code: 0,
      data: {
        _id: folder._id.toString(),
        name: folder.name,
        description: folder.description || '',
        coverKey: folder.coverKey || '',
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
        albumCount: 0,
      },
    })
  })

  // 更新文件夹
  router.put('/update', async (ctx) => {
    const { id, name, description } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')

    const updateData: any = { updatedBy: operator }
    if (typeof name !== 'undefined') updateData.name = name
    if (typeof description !== 'undefined') updateData.description = description

    const folder = await AlbumFolder.findOneAndUpdate(
      { _id: id, username, deleted: false },
      { $set: updateData },
      { new: true }
    )
    if (!folder) {
      return ctx.json({ code: 1, message: '文件夹不存在' })
    }

    return ctx.json({
      code: 0,
      data: {
        _id: folder._id.toString(),
        name: folder.name,
        description: folder.description || '',
        coverKey: folder.coverKey || '',
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      },
    })
  })

  // 删除文件夹（软删），同时把该文件夹下相册的 folderId 置空
  router.delete('/delete', async (ctx) => {
    const { id } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')

    const folder = await AlbumFolder.findOneAndUpdate(
      { _id: id, username, deleted: false },
      { $set: { deleted: true, updatedBy: operator } },
      { new: true }
    )
    if (!folder) {
      return ctx.json({ code: 1, message: '文件夹不存在' })
    }

    // 清空该文件夹下的相册关联
    await Album.updateMany(
      { username, deleted: false, folderId: folder._id.toString() },
      { $set: { folderId: null, updatedBy: operator } }
    )

    return ctx.json({ code: 0 })
  })

  // 移动单个相册到指定文件夹（folderId 为 null 表示移出）
  router.put('/setAlbum', async (ctx) => {
    const { albumId, folderId } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')

    // 校验目标文件夹存在
    if (folderId) {
      const folder = await AlbumFolder.findOne({ _id: folderId, username, deleted: false })
      if (!folder) {
        return ctx.json({ code: 1, message: '目标文件夹不存在' })
      }
    }

    await Album.findOneAndUpdate(
      { _id: albumId, username, deleted: false },
      { $set: { folderId: folderId || null, updatedBy: operator } },
      { new: true }
    )

    return ctx.json({ code: 0 })
  })

  // 批量将一组相册设置到指定文件夹（folderId 为 null 表示全部移出）
  router.put('/setAlbums', async (ctx) => {
    const { albumIds, folderId } = await ctx.req.json()
    const username = ctx.get('username')
    const operator = ctx.get('operator')

    if (!Array.isArray(albumIds)) {
      return ctx.json({ code: 1, message: 'albumIds 必须是数组' })
    }

    if (folderId) {
      const folder = await AlbumFolder.findOne({ _id: folderId, username, deleted: false })
      if (!folder) {
        return ctx.json({ code: 1, message: '目标文件夹不存在' })
      }
    }

    await Album.updateMany(
      { _id: { $in: albumIds }, username, deleted: false },
      { $set: { folderId: folderId || null, updatedBy: operator } }
    )

    return ctx.json({ code: 0 })
  })

  return 'albumFolder'
}
