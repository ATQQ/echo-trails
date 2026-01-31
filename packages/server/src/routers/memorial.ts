import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import { Memorial } from "../db/memorial";
import { createCoverLink, createPreviewLink } from "../lib/bitiful";

export default function memorialRouter(router: Hono<BlankEnv, BlankSchema, "/">) {

  // List Memorials
  router.get('list', async (ctx) => {
    const username = ctx.get('username');

    const memorials = await Memorial.find({ username, deleted: false }).sort({ isPinned: -1, date: 1 });

    const data = await Promise.all(memorials.map(async m => {
        let coverImage = '';
        if (m.coverImage) {
            if (m.coverImage.startsWith('http')) {
                coverImage = m.coverImage;
            } else {
                coverImage = await createPreviewLink(m.coverImage, true);
            }
        }

        return {
            id: m._id.toString(),
            name: m.name,
            date: m.date,
            endDate: m.endDate,
            description: m.description,
            displayTitle: m.displayTitle,
            type: m.type,
            isLunar: m.isLunar,
            isPinned: m.isPinned,
            coverImage: coverImage,
            createdAt: new Date(m.createdAt).getTime()
        };
    }));

    return ctx.json({ code: 0, data });
  });

  // Create Memorial
  router.post('create', async (ctx) => {
    const body = await ctx.req.json();
    const username = ctx.get('username');
    const operator = ctx.get('operator');

    const memorial = new Memorial({
      ...body,
      username,
      createdBy: operator,
      updatedBy: operator
    });
    await memorial.save();

    return ctx.json({ code: 0, data: memorial });
  });

  // Update Memorial
  router.put('update', async (ctx) => {
    const { id, ...updates } = await ctx.req.json();
    const username = ctx.get('username');
    const operator = ctx.get('operator');

    const memorial = await Memorial.findOne({ _id: id, username });
    if (!memorial) return ctx.json({ code: 1, message: 'not found' });

    Object.assign(memorial, updates);
    memorial.updatedBy = operator;
    await memorial.save();

    return ctx.json({ code: 0, message: 'success' });
  });

  // Delete Memorial
  router.delete('delete', async (ctx) => {
    const { id } = await ctx.req.json();
    const username = ctx.get('username');

    await Memorial.updateOne({ _id: id, username }, { deleted: true });
    return ctx.json({ code: 0, message: 'success' });
  });

  // Get Preset Covers
  router.get('covers', (ctx) => {
    const PRESET_COVERS = [
        'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80', // 默认 (粉色云朵)
        'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80', // 极简叶子 (清新)
        'https://images.unsplash.com/photo-1490750967868-58cb7506aed6?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80', // 花朵特写 (温馨)
        'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80', // 海滩日落 (浪漫)
        'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80', // 森林雾气 (神秘/自然)
        'https://images.unsplash.com/photo-1513201099705-a9746e1e201f?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80', // 礼物/节日 (庆祝)
        'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80', // 汽车/旅行 (在路上)
        'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80', // 派对灯光 (欢乐)
        'https://images.unsplash.com/photo-1501901609772-df0848060b33?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80', // 星空 (永恒)
        'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80', // 书籍/咖啡 (宁静)
        'https://images.unsplash.com/photo-1530103862676-de3c9a59af57?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'  // 抽象渐变 (现代)
    ];
    return ctx.json({ code: 0, data: PRESET_COVERS });
  });

  return 'memorial';
}
