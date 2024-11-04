// 定义 process.env 类型
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    BASIC_AUTH_USERNAME: string;
    BASIC_AUTH_PASSWORD: string;
    BASIC_AUTH_REALM: string;
    BITIFUL_API_TOEKN: string;
    S3_ACCESS_KEY: string;
    S3_SECRET_KEY: string;
    S3_BUCKET: string;
  }
}
