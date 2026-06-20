import type { MemorialDay } from '@/stores/memorial';

export function normalizeMemorial(m: any): MemorialDay {
  return {
    ...m,
    id: m.id || m._id,
    isPinned: !!m.isPinned,
    showOnAlbumHome: !!m.showOnAlbumHome,
    isLunar: !!m.isLunar,
    rawCoverImage: m.rawCoverImage ?? m.coverImage,
    createdAt: Number.isFinite(m.createdAt)
      ? m.createdAt
      : new Date(m.createdAt || m.updated_at || Date.now()).getTime(),
  };
}
