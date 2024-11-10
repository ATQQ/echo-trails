import { $ } from 'bun'
// user config
const originName = 'photo'

// not care
const compressPkgName = `${originName}.tar.gz`
const user = 'root'
const origin = 'sugarat.top'
const fullOrigin = `${originName}.${origin}`
const baseServerDir = '/www/wwwroot'
const destDir = ''

await $`npm run build:client`

console.log('压缩生成', compressPkgName);
await $`cd packages/app && tar -zvcf ${compressPkgName} dist`

console.log('上传压缩包到服务器');
await $`cd packages/app && scp ${compressPkgName} ${user}@${fullOrigin}:./`
await $`cd packages/app && rm -rf ${compressPkgName}`

console.log('解压到服务器');
await $`ssh -p22 ${user}@${fullOrigin} "tar -xf ${compressPkgName} -C ${baseServerDir}/${fullOrigin}/${destDir}"`
