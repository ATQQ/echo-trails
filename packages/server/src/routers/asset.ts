import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import { Asset } from "../db/asset";
import { AssetCategory } from "../db/assetCategory";
import { createCoverLink } from "../lib/bitiful";

const DEFAULT_CATEGORIES = [
  {
    name: '数码',
    subs: ['手机', '电脑', '平板', '相机', '配件']
  },
  {
    name: '衣物',
    subs: ['上衣', '裤子', '鞋靴', '包袋', '配饰']
  },
  {
    name: '家电',
    subs: ['大家电', '厨房电器', '生活电器']
  },
  {
    name: '家具',
    subs: ['桌椅', '储物', '床具']
  },
  {
    name: '图书',
    subs: ['技术', '文学']
  },
  {
    name: '交通',
    subs: ['汽车', '自行车']
  },
  {
    name: '虚拟',
    subs: ['软件', '订阅']
  }
];

export default function assetRouter(router: Hono<BlankEnv, BlankSchema, "/">) {

  // --- Category Routes ---

  // Get all categories (nested)
  router.get('category/list', async (ctx) => {
    const username = ctx.get('username');
    if (!username) return ctx.json({ code: 1, message: 'username required' });

    let categories = await AssetCategory.find({ username }).lean();

    // Seed default categories if empty
    if (categories.length === 0) {
      const promises = [];
      for (const defCat of DEFAULT_CATEGORIES) {
        const cat = new AssetCategory({
          username,
          name: defCat.name,
          isSystem: true
        });
        await cat.save();

        // Add subs
        if (defCat.subs && defCat.subs.length > 0) {
            for (const subName of defCat.subs) {
                const sub = new AssetCategory({
                    username,
                    name: subName,
                    parentId: cat._id.toString(),
                    isSystem: true
                });
                await sub.save();
            }
        }
      }
      // Re-fetch after seeding
      categories = await AssetCategory.find({ username }).lean();
    }

    // Build nested structure
    const mainCategories = categories.filter(c => !c.parentId);
    const subCategories = categories.filter(c => c.parentId);

    const result = mainCategories.map(main => ({
      id: main._id.toString(),
      name: main.name,
      isSystem: main.isSystem,
      subCategories: subCategories
        .filter(sub => sub.parentId === main._id.toString())
        .map(sub => ({ id: sub._id.toString(), name: sub.name, isSystem: sub.isSystem }))
    }));

    return ctx.json({ code: 0, data: result });
  });

  // Create Category
  router.post('category/create', async (ctx) => {
    const { name, parentId } = await ctx.req.json();
    const username = ctx.get('username');

    const category = new AssetCategory({
      username,
      name,
      parentId: parentId || null
    });
    await category.save();

    return ctx.json({ code: 0, data: { id: category._id, name: category.name, isSystem: false } });
  });

  // Delete Category
  router.delete('category/delete', async (ctx) => {
    const { id } = await ctx.req.json();
    const username = ctx.get('username');

    // Check if system category
    const category = await AssetCategory.findOne({ _id: id, username });
    if (!category) return ctx.json({ code: 1, message: 'not found' });
    if (category.isSystem) return ctx.json({ code: 1, message: 'cannot delete system category' });

    // Simple implementation: delete the category.
    await AssetCategory.deleteOne({ _id: id, username });
    // Also delete subcategories if it's a main category
    // NOTE: If we allowed adding custom subcategories to system main categories, we should be careful.
    // But currently frontend logic handles removal of subcategory separately.
    // If deleting a main category, we should delete all its subs.
    // However, if it's a system category, we blocked deletion above.
    // If it's a custom category, it might have custom subs.
    await AssetCategory.deleteMany({ parentId: id, username });

    return ctx.json({ code: 0, message: 'success' });
  });

  // --- Asset Routes ---

  // List Assets
  router.get('list', async (ctx) => {
    const username = ctx.get('username');
    const { categoryId, status } = ctx.req.query();

    const query: any = { username, deleted: false };
    if (categoryId && categoryId !== 'all') {
      query.categoryId = categoryId;
    }
    const { subCategoryId } = ctx.req.query();
    if (subCategoryId && subCategoryId !== 'all') {
        query.subCategoryId = subCategoryId;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    const assets = await Asset.find(query).sort({ purchaseDate: -1 });

    // Map to frontend structure
    const data = await Promise.all(assets.map(async a => {
      let cover = '';
      if (a.image) {
        // Check if image is already a full URL (legacy or external)
        if (a.image.startsWith('http')) {
             cover = a.image;
        } else {
             // Generate signed/processed link
             // Determine if it is image based on extension or metadata if available
             // For now assume image if not video path?
              // createCoverLink handles style appending.
              // We can assume it is an image if it's in assets/
              cover = await createCoverLink(a.image, true);
        }
      }

      // Calculation logic for costPerUse and daysHeld
      const now = Date.now();
      const pDate = new Date(a.purchaseDate).getTime();
      const daysHeld = Math.max(1, Math.floor((now - pDate) / (1000 * 60 * 60 * 24)));
      
      let costPerUse = 0;
      let costPerDay = 0;

      if (a.calcType === 'count') {
          costPerUse = a.usageCount > 0 ? a.price / a.usageCount : a.price;
      } else if (a.calcType === 'day') {
          costPerDay = a.price / daysHeld;
      }

      return {
        id: a._id.toString(),
        name: a.name,
        categoryId: a.categoryId,
        subCategoryId: a.subCategoryId,
        status: a.status,
        price: a.price,
        purchaseDate: pDate,
        usageCount: a.usageCount,
        calcType: a.calcType,
        description: a.description,
        image: a.image,
        cover: cover,
        createTime: new Date(a.createdAt).getTime(),
        // Computed fields
        costPerUse,
        costPerDay,
        daysHeld
      };
    }));

    return ctx.json({ code: 0, data });
  });

  // Create Asset
  router.post('create', async (ctx) => {
    const body = await ctx.req.json();
    const username = ctx.get('username');
    const operator = ctx.get('operator');

    const asset = new Asset({
      ...body,
      username,
      createdBy: operator,
      updatedBy: operator,
      purchaseDate: new Date(body.purchaseDate)
    });
    await asset.save();

    return ctx.json({ code: 0, data: asset });
  });

  // Update Asset
  router.put('update', async (ctx) => {
    const { id, ...updates } = await ctx.req.json();
    const username = ctx.get('username');
    const operator = ctx.get('operator');

    const asset = await Asset.findOne({ _id: id, username });
    if (!asset) return ctx.json({ code: 1, message: 'not found' });

    Object.assign(asset, updates);
    if (updates.purchaseDate) {
        asset.purchaseDate = new Date(updates.purchaseDate);
    }
    asset.updatedBy = operator;
    await asset.save();

    return ctx.json({ code: 0, message: 'success' });
  });

  // Delete Asset
  router.delete('delete', async (ctx) => {
    const { id } = await ctx.req.json();
    const username = ctx.get('username');

    await Asset.updateOne({ _id: id, username }, { deleted: true });
    return ctx.json({ code: 0, message: 'success' });
  });

  // Asset Stats
  router.get('stats', async (ctx) => {
    const username = ctx.get('username');
    const assets = await Asset.find({ username, deleted: false });

    // Calculate total value and daily cost
    // This logic mimics the frontend computed properties
    let totalValue = 0;
    let dailyCost = 0;
    const now = Date.now();
    let totalDays = 0;
    let totalP = 0;

    assets.forEach(item => {
        totalValue += item.price;

        // Daily cost calculation
        const pDate = new Date(item.purchaseDate).getTime();
        const days = Math.max(1, Math.floor((now - pDate) / (1000 * 60 * 60 * 24)));
        totalDays += days;
        totalP += item.price;
    });

    dailyCost = totalDays > 0 ? (totalP / totalDays) : 0;

    return ctx.json({
        code: 0,
        data: {
            totalValue,
            dailyCost
        }
    });
  });

  return 'asset';
}
