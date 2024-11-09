interface Photo {
  url: string;
  cover: string;
  preview: string;
  username: string;
  type: string;
  key: string;
  uploadDate: string;
  lastModified: string;
  name: string;
  size: number;
  category: string;
}

type ServerResponse<T> = {
  code?: number;
  message?: string;
  data: T;
}
