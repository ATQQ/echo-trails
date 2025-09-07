import { BlankEnv, BlankSchema } from "hono/types";
import { Hono } from 'hono'
import { bitifulConfig, refreshBitifulConfig } from "../lib/bitiful";
import { bitifulS3Manager } from "../lib/bitiful";

export default function configRouter(router: Hono<BlankEnv, BlankSchema, "/">) {
  // 获取 bitiful 配置
  router.get('/bitiful', async (ctx) => {
    const { secretKey, accessKey, ...otherConfig } = bitifulConfig
    return ctx.json({
      code: 0,
      data: otherConfig
    })
  })

  // 更新 bitiful 配置
  router.put('/bitiful', async (ctx) => {
    const config = await ctx.req.json()

    try {
      // 更新配置
      refreshBitifulConfig(config)
      bitifulS3Manager.refreshClient()

      return ctx.json({
        code: 0,
        message: 'bitiful 配置更新成功',
        data: bitifulConfig
      })
    } catch (error: any) {
      return ctx.json({
        code: 1,
        message: error.message || '配置更新失败'
      })
    }
  })

  return '/config'
}
