interface Photo {
  _id: string;
  url: string;
  cover: string;
  preview: string;
  username: string;
  fileType: string;
  type: string;
  key: string;
  uploadDate: string;
  lastModified: string;
  name: string;
  size: number;
  category: string;
  width: number;
  height: number;
  isLiked: boolean;
  albumId?: string[];
  description?: string;
}

type ServerResponse<T> = {
  code?: number;
  message?: string;
  data: T;
}
