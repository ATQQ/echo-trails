import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DriveFile } from "../db/driveFile";
import { bitifulS3Manager, bitifulConfig, createCdnLink, deleteS3Object } from "../lib/bitiful";

function formatDriveFileResponse(f: any) {
  return {
    id: f._id?.toString?.() || f.id,
    name: f.name,
    kind: f.kind,
    parentId: f.parentId || '',
    key: f.key || '',
    size: f.size || 0,
    mimeType: f.mimeType || '',
    provider: f.provider || 'bitiful',
    createdAt: new Date(f.createdAt).getTime(),
    updatedAt: new Date(f.updatedAt).getTime(),
  };
}

async function buildBreadcrumb(username: string, parentId: string) {
  const chain: { id: string, name: string }[] = [];
  let currentId = parentId;
  // 防环：上限 50 层
  for (let i = 0; i < 50 && currentId; i++) {
    const folder = await DriveFile.findOne(
      { _id: currentId, username, kind: 'folder', deleted: false },
      ['name', 'parentId']
    );
    if (!folder) break;
    chain.unshift({ id: folder._id.toString(), name: folder.name });
    currentId = folder.parentId || '';
  }
  return chain;
}

// 收集文件夹自身及其所有后代 id（软删除用）
async function collectDescendantIds(username: string, rootId: string) {
  const ids = [rootId];
  let frontier = [rootId];
  for (let i = 0; i < 50 && frontier.length; i++) {
    const children = await DriveFile.find(
      { username, parentId: { $in: frontier }, deleted: false },
      ['_id']
    );
    frontier = children.map(c => c._id.toString());
    ids.push(...frontier);
  }
  return ids;
}

// 收集文件夹自身及其所有后代 id（回收站恢复/彻底删除用，不过滤 deleted 标记）
async function collectDescendantIdsForTrash(username: string, rootId: string) {
  const ids = [rootId];
  let frontier = [rootId];
  for (let i = 0; i < 50 && frontier.length; i++) {
    const children = await DriveFile.find(
      { username, parentId: { $in: frontier } },
      ['_id']
    );
    frontier = children.map(c => c._id.toString());
    ids.push(...frontier);
  }
  return ids;
}

export default function driveFileRouter(router: Hono<BlankEnv, BlankSchema, "/">) {

  // List files & folders of a directory (with breadcrumb)
  router.get('list', async (ctx) => {
    const username = ctx.get('username');
    const parentId = ctx.req.query('parentId') || '';

    const items = await DriveFile.find({ username, parentId, deleted: false })
      .sort({ kind: 1, createdAt: -1 });

    const breadcrumb = await buildBreadcrumb(username, parentId);

    return ctx.json({
      code: 0,
      data: {
        items: items.map(formatDriveFileResponse),
        breadcrumb,
      }
    });
  });

  // Create folder
  router.post('folder', async (ctx) => {
    const { name, parentId = '' } = await ctx.req.json();
    const username = ctx.get('username');
    const operator = ctx.get('operator');

    if (!name) {
      return ctx.json({ code: 1, message: 'name is required' });
    }

    const folder = new DriveFile({
      username,
      name,
      kind: 'folder',
      parentId,
      provider: 'bitiful',
      createdBy: operator,
      updatedBy: operator
    });
    await folder.save();

    return ctx.json({ code: 0, data: formatDriveFileResponse(folder) });
  });

  // Register uploaded file
  router.post('create', async (ctx) => {
    const { key, name, size = 0, mimeType = '', parentId = '' } = await ctx.req.json();
    const username = ctx.get('username');
    const operator = ctx.get('operator');

    if (!key || !name) {
      return ctx.json({ code: 1, message: 'key and name are required' });
    }

    const file = new DriveFile({
      username,
      name,
      kind: 'file',
      parentId,
      key,
      size: Number(size) || 0,
      mimeType,
      provider: 'bitiful',
      bucket: bitifulConfig.bucket,
      createdBy: operator,
      updatedBy: operator
    });
    await file.save();

    return ctx.json({ code: 0, data: formatDriveFileResponse(file) });
  });

  // Rename
  router.put('rename', async (ctx) => {
    const { id, name } = await ctx.req.json();
    const username = ctx.get('username');
    const operator = ctx.get('operator');

    if (!name) {
      return ctx.json({ code: 1, message: 'name is required' });
    }

    const item = await DriveFile.findOne({ _id: id, username });
    if (!item) return ctx.json({ code: 1, message: 'not found' });

    item.name = name;
    item.updatedBy = operator;
    await item.save();

    return ctx.json({ code: 0, data: formatDriveFileResponse(item) });
  });

  // Move
  router.put('move', async (ctx) => {
    const { id, parentId = '' } = await ctx.req.json();
    const username = ctx.get('username');
    const operator = ctx.get('operator');

    const item = await DriveFile.findOne({ _id: id, username });
    if (!item) return ctx.json({ code: 1, message: 'not found' });

    if (item.kind === 'folder') {
      // 目标不能是自身或自身的后代
      if (id === parentId) {
        return ctx.json({ code: 1, message: 'cannot move to itself' });
      }
      const descendantIds = await collectDescendantIds(username, id);
      if (descendantIds.includes(parentId)) {
        return ctx.json({ code: 1, message: 'cannot move to its own descendant' });
      }
    }

    item.parentId = parentId;
    item.updatedBy = operator;
    await item.save();

    return ctx.json({ code: 0, data: formatDriveFileResponse(item) });
  });

  // Delete (recursive soft delete for folders)
  router.delete('delete', async (ctx) => {
    const { id } = await ctx.req.json();
    const username = ctx.get('username');
    const operator = ctx.get('operator');

    const item = await DriveFile.findOne({ _id: id, username });
    if (!item) return ctx.json({ code: 1, message: 'not found' });

    const ids = item.kind === 'folder'
      ? await collectDescendantIds(username, id)
      : [id];

    await DriveFile.updateMany(
      { _id: { $in: ids }, username },
      { deleted: true, updatedBy: operator }
    );

    return ctx.json({ code: 0, message: 'success' });
  });

  // ==================== 回收站 ====================

  // 回收站列表：仅顶级软删项（被软删且父目录未被软删，避免后代重复展示）
  router.get('trash-list', async (ctx) => {
    const username = ctx.get('username');
    const allDeleted = await DriveFile.find({ username, deleted: true })
      .sort({ updatedAt: -1 });
    const deletedIdSet = new Set(allDeleted.map((it: any) => it._id.toString()));
    const items = allDeleted.filter((it: any) => !it.parentId || !deletedIdSet.has(it.parentId));
    return ctx.json({ code: 0, data: { items: items.map(formatDriveFileResponse) } });
  });

  // 恢复（递归恢复所有后代）
  router.post('restore', async (ctx) => {
    const { id } = await ctx.req.json();
    const username = ctx.get('username');
    const operator = ctx.get('operator');

    const item = await DriveFile.findOne({ _id: id, username });
    if (!item) return ctx.json({ code: 1, message: 'not found' });

    const ids = item.kind === 'folder'
      ? await collectDescendantIdsForTrash(username, id)
      : [id];

    await DriveFile.updateMany(
      { _id: { $in: ids }, username },
      { deleted: false, updatedBy: operator }
    );

    return ctx.json({ code: 0, message: 'success' });
  });

  // 彻底删除（DB 物理删除 + S3 对象删除，S3 失败不阻塞 DB 清理）
  router.delete('purge', async (ctx) => {
    const { id } = await ctx.req.json();
    const username = ctx.get('username');

    const item = await DriveFile.findOne({ _id: id, username });
    if (!item) return ctx.json({ code: 1, message: 'not found' });

    const ids = item.kind === 'folder'
      ? await collectDescendantIdsForTrash(username, id)
      : [id];

    // 收集所有 file 的 key（folder 无 key），批量删 S3
    const files = await DriveFile.find(
      { _id: { $in: ids }, username, kind: 'file', key: { $ne: '' } },
      ['key']
    );
    let s3Failed = 0;
    await Promise.all(files.map(f => deleteS3Object(f.key!).catch(() => { s3Failed++; })));

    await DriveFile.deleteMany({ _id: { $in: ids }, username });

    return ctx.json({ code: 0, message: s3Failed > 0 ? `部分云端文件清理失败：${s3Failed} 个` : 'success' });
  });

  // 清空回收站（彻底删除当前用户所有软删记录）
  router.delete('purge-all', async (ctx) => {
    const username = ctx.get('username');

    const files = await DriveFile.find(
      { username, deleted: true, kind: 'file', key: { $ne: '' } },
      ['key']
    );
    let s3Failed = 0;
    await Promise.all(files.map(f => deleteS3Object(f.key!).catch(() => { s3Failed++; })));

    await DriveFile.deleteMany({ username, deleted: true });

    return ctx.json({ code: 0, message: s3Failed > 0 ? `部分云端文件清理失败：${s3Failed} 个` : 'success' });
  });

  // Share link (presigned GET url)
  router.get('share', async (ctx) => {
    const id = ctx.req.query('id');
    const expires = Number(ctx.req.query('expires')) || 86400;
    const username = ctx.get('username');

    const item = await DriveFile.findOne({ _id: id, username, kind: 'file', deleted: false });
    if (!item || !item.key) return ctx.json({ code: 1, message: 'file not found' });

    // 配置了 CDN 域名时优先使用 CDN 鉴权直链
    const cdnUrl = createCdnLink(item.key, expires);
    if (cdnUrl) {
      return ctx.json({ code: 0, data: { url: cdnUrl, expiresIn: expires } });
    }

    const cmd = new GetObjectCommand({
      Bucket: item.bucket || bitifulConfig.bucket,
      Key: item.key,
    });
    const url = await getSignedUrl(bitifulS3Manager.getClient(), cmd, { expiresIn: expires });

    return ctx.json({ code: 0, data: { url, expiresIn: expires } });
  });

  // Download link (short-term presigned url)
  router.get('download', async (ctx) => {
    const id = ctx.req.query('id');
    const username = ctx.get('username');

    const item = await DriveFile.findOne({ _id: id, username, kind: 'file', deleted: false });
    if (!item || !item.key) return ctx.json({ code: 1, message: 'file not found' });

    // 配置了 CDN 域名时优先使用 CDN 鉴权直链
    const cdnUrl = createCdnLink(item.key, 3600);
    if (cdnUrl) {
      return ctx.json({ code: 0, data: { url: cdnUrl, expiresIn: 3600 } });
    }

    const cmd = new GetObjectCommand({
      Bucket: item.bucket || bitifulConfig.bucket,
      Key: item.key,
    });
    const url = await getSignedUrl(bitifulS3Manager.getClient(), cmd, { expiresIn: 3600 });

    return ctx.json({ code: 0, data: { url, expiresIn: 3600 } });
  });

  return 'drive-file';
}
