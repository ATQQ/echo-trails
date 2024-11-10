import { $ } from 'bun'
// user config
const originName = 'photo'

// not care
const compressPkgName = `${originName}-server.tar.gz`
const user = 'root'
const origin = 'sugarat.top'
const fullOrigin = `${originName}.${origin}`
const baseServerDir = '/www/wwwroot'
const destDir = 'server'

console.log('压缩生成', compressPkgName);
await $`cd packages/server && tar -zvcf ${compressPkgName} src types .env package.json tsconfig.json bunfig.toml`

console.log('上传压缩包到服务器');
await $`cd packages/server && scp ${compressPkgName} ${user}@${fullOrigin}:./`
await $`cd packages/server && rm -rf ${compressPkgName}`

console.log('解压到服务器');
const serverDir = `${baseServerDir}/${fullOrigin}/${destDir}`
await $`ssh -p22 ${user}@${fullOrigin} "tar -xf ${compressPkgName} -C ${serverDir}"`
await $`ssh -p22 ${user}@${fullOrigin} "cd ${serverDir} && bun install && pm2 delete echo-trails && pm2 start npm --name echo-trails -- run start
 "`
