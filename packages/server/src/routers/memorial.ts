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
            if (m.coverImage.startsWith('http') || m.coverImage.startsWith('/')) {
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
            rawCoverImage: m.coverImage,
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
        '/memorial-covers/pink-clouds.jpg',
        '/memorial-covers/minimal-leaves.jpg',
        '/memorial-covers/flower-closeup.jpg',
        '/memorial-covers/sunset-beach.jpg',
        '/memorial-covers/misty-forest.jpg',
        '/memorial-covers/gift-celebration.jpg',
        '/memorial-covers/road-trip-car.jpg',
        '/memorial-covers/party-lights.jpg',
        '/memorial-covers/starry-night.jpg',
        '/memorial-covers/books-coffee.jpg',
        '/memorial-covers/abstract-gradient.jpg'
    ];
    return ctx.json({ code: 0, data: PRESET_COVERS });
  });

  return 'memorial';
}
