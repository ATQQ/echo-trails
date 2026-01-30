import mongoose from 'mongoose';

const assetCategorySchema = new mongoose.Schema({
  username: { type: String, required: true },
  name: { type: String, required: true },
  parentId: { type: String, default: null }, // If null, it's a main category
  order: { type: Number, default: 0 },
  isSystem: { type: Boolean, default: false }, // New field
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() }
}, { timestamps: true });

// Index for querying categories by user and parent
assetCategorySchema.index({ username: 1, parentId: 1 });

export type AssetCategory = mongoose.InferSchemaType<typeof assetCategorySchema>;
export const AssetCategory = mongoose.model('AssetCategory', assetCategorySchema);
