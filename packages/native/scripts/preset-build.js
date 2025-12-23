import { networkInterfaces } from 'os';
import fs from 'fs'

// 1. Get Local IP
function getLocalIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const ip = getLocalIp();
const port = 1420;
const origin = `http://${ip}:${port}`;

console.log(`[Echo Trails] Auto-detected IP: ${ip}`);
console.log(`[Echo Trails] VITE_BASE_ORIGIN: ${origin}`);
const data = fs.readFileSync('./src-tauri/tauri.conf.json', 'utf8');
const conf = JSON.parse(data);
conf.build.beforeDevCommand = `cd ../app && VITE_BASE_ORIGIN=${origin} TAURI=true bun run dev`;
conf.build.devUrl = origin;
fs.writeFileSync('./src-tauri/tauri.conf.json', JSON.stringify(conf, null, 2));
