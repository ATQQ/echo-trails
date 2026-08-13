import { $ } from 'bun'

await $`bun run build:client`

console.log('Kite 部署前端')
await $`cd packages/app && kite push --env prod`
