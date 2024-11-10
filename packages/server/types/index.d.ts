// 定义 process.env 类型
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    BITIFUL_API_TOEKN: string;
    S3_ACCESS_KEY: string;
    S3_SECRET_KEY: string;
    S3_BUCKET: string;
    S3_DOMAIN: string;
    AUTH_TOKEN: string;
    AUTH_NAME: string;
    BITIFUL_COVER_STYLE: string;
    BITIFUL_PREVIEW_STTYLE: string;
    BITIFUL_ALBUM_STYLE: string;
  }
}
