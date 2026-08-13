import { $ } from 'bun'

console.log('Kite 部署服务端')
await $`cd packages/server && kite push --env prod`
