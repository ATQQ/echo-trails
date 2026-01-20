import { Hono } from 'hono'

// 定义版本信息接口
interface VersionInfo {
  version: string
  downloadUrl: string
  forceUpdate: boolean
  description: string
  md5: string
}

interface PlatformVersion {
  macos: VersionInfo[]
  windows: VersionInfo[]
  linux: VersionInfo[]
  android: VersionInfo[]
  ios: VersionInfo[]
}

// 简单的版本比较函数
// 返回 1: v1 > v2, -1: v1 < v2, 0: v1 = v2
function compareVersion(v1: string, v2: string): number {
  if (!v1 || !v2) return 0;
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  const len = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < len; i++) {
    const n1 = parts1[i] || 0;
    const n2 = parts2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

export default function appRouter(app: Hono) {
  // 检查更新接口 - 公开接口，不需要鉴权
  // 此接口现在负责：
  // 1. 读取后端配置的 VERSION_URLS
  // 2. 尝试拉取远程配置
  // 3. 比较版本号
  // 4. 返回处理好的结果给前端
  app.get('/check-update', async (c) => {
    const currentVersion = c.req.query('version')
    const platform = (c.req.query('platform') || 'android') as keyof PlatformVersion

    if (!currentVersion) {
      return c.json({ code: -1, message: 'Missing version parameter' })
    }

    // 从环境变量读取更新配置 URLs
    const versionUrlsEnv = process.env.VERSION_URLS || '';
    const urls = versionUrlsEnv.split(',').map(u => u.trim()).filter(u => u);

    // 如果没有配置，使用默认值或者返回错误
    // 这里为了演示方便，如果没配置则使用一个示例地址，或者直接返回无更新
    if (urls.length === 0) {
      // 也可以在这里硬编码一个默认地址作为 fallback
      // urls.push('https://example.com/version.json');
    }

    let versionConfig: PlatformVersion | null = null;

    // 轮询尝试所有 URL
    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

        const response = await fetch(`${url}?t=${Date.now()}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json() as any;
           // 兼容可能的返回结构
           if (data && typeof data.code === 'number' && data.data) {
             versionConfig = data.data;
          } else {
             versionConfig = data;
          }
          break;
        }
      } catch (e) {
        console.error(`Failed to fetch version from ${url}`, e);
      }
    }

    // 如果没有获取到配置，或者配置中没有对应平台信息
    if (!versionConfig || !versionConfig[platform] || !Array.isArray(versionConfig[platform])) {
       // 如果实在获取不到，返回一个默认状态，或者告诉前端无更新
       return c.json({
         code: 0,
         data: {
           hasUpdate: false,
           message: 'Unable to fetch version info'
         }
       })
    }

    // 获取该平台的所有版本信息
    const platformVersions = versionConfig[platform] as VersionInfo[];

    // 按版本号降序排序
    platformVersions.sort((a, b) => compareVersion(b.version, a.version));

    // 获取最新版本
    const latestVersionInfo = platformVersions[0];

    if (!latestVersionInfo) {
      return c.json({
         code: 0,
         data: {
           hasUpdate: false,
           message: 'No version info found'
         }
       })
    }

    const hasUpdate = compareVersion(latestVersionInfo.version, currentVersion) > 0;

    // 构造最终返回给前端的数据
    const result = {
      hasUpdate,
      currentVersion: currentVersion,
      latestVersion: latestVersionInfo.version,
      description: latestVersionInfo.description, // 使用版本描述作为更新说明
      downloadUrl: latestVersionInfo.downloadUrl,
      forceUpdate: latestVersionInfo.forceUpdate,
      md5: latestVersionInfo.md5
    };

    return c.json({
      code: 0,
      data: result
    })
  })

  return 'app'
}
