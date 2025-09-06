# Echo Trails - 相册APP

## S3上传功能使用说明

Echo Trails 现在支持直接上传文件到AWS S3存储桶。这里是使用方法：

### 环境变量配置

1. 复制 `.env.example` 文件并重命名为 `.env`
2. 填写你的AWS认证信息和S3桶名：
   ```
   S3_BUCKET=your-bucket-name
   AWS_REGION=your-region
   AWS_ACCESS_KEY_ID=your-access-key
   AWS_SECRET_ACCESS_KEY=your-secret-key
   ```
