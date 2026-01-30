import mongoose from 'mongoose';

const assetSchema = new mongoose.Schema({
  username: { type: String, required: true },
  name: { type: String, required: true },
  categoryId: { type: String, required: true },
  subCategoryId: { type: String, default: null },
  status: { 
    type: String, 
    enum: ['active', 'retired', 'sold'], 
    default: 'active' 
  },
  price: { type: Number, required: true },
  purchaseDate: { type: Date, required: true },
  usageCount: { type: Number, default: 0 },
  calcType: { 
    type: String, 
    enum: ['count', 'day', 'consumable'], 
    default: 'count' 
  },
  description: { type: String, default: '' },
  image: { type: String, default: '' }, // Stores the S3 key or full URL? Usually key is better if using S3.
  imageWidth: { type: Number, default: 0 },
  imageHeight: { type: Number, default: 0 },
  deleted: { type: Boolean, default: false },
  createdBy: { type: String, required: false },
  updatedBy: { type: String, required: false },
  createdAt: { type: Date, default: () => new Date() },
  updatedAt: { type: Date, default: () => new Date() }
}, { timestamps: true });

assetSchema.index({ username: 1, deleted: 1, categoryId: 1 });

export type Asset = mongoose.InferSchemaType<typeof assetSchema>;
export const Asset = mongoose.model('Asset', assetSchema);
