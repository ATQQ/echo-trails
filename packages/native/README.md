<div align="center">
  <a href="https://github.com/ATQQ/echo-trails">
    <img src="./../../logo.png" alt="Logo" width="120" height="120">
  </a>

  <h3>记忆的回响 | echo-trails</h3>
  <p>
    <a href="https://photo.sugarat.top">Website</a>
    ·
    <a href="https://github.com/ATQQ/echo-trails/releases/latest">Releases</a>
    <br />
    <br />
    <!-- TODO：其它logo -->
  </p>
</div>

<!-- TODO：网页截图 -->

一个私人的相册APP。

“echo” 可以象征着记忆的回响，过去的经历像回声一样在这些 “trails” 上徘徊，每当走过，就能听到记忆的声音。

## 👋🏻 Getting Started
```sh
bun install
```
修改 tauri.conf.json 中 `devUrl` 和 `VITE_BASE_ORIGIN` 为当前设备的局域网地址
```json
{
  "build": {
    "beforeDevCommand": "cd ../app && VITE_BASE_ORIGIN=http://192.168.31.173:1420 TAURI=true bun run dev",
    "devUrl": "http://192.168.31.173:1420"
  },
}
```


```sh
# android
bun run dev:android
```

