import mongoose from 'mongoose';
import { Context, Next } from 'hono';

let timer: NodeJS.Timeout | null = null
let isConnected = false

export async function initConnect() {
  if (isConnected) return
  const dbName = process.env.DB_NAME || 'echo-trails-app'
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(`mongodb://127.0.0.1:27017/${dbName}`);
  }
  isConnected = true
}

function clearDisconnectTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function startDisconnectTimer() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      isConnected = false
    } catch (e) {
      console.error('DB disconnect error:', e);
    }
  }, 1000 * 60 * 30); // 30分钟无操作断开
}

export async function dbMiddleware(c: Context, next: Next) {
  await initConnect();
  clearDisconnectTimer();

  try {
    await next();
  } finally {
    startDisconnectTimer();
  }
}

export async function exec<T extends (...args: any[]) => any>(fn: T) {
  await initConnect();
  clearDisconnectTimer();

  try {
    const result: ReturnType<T> = await fn();
    return result;
  } catch (error) {
    console.error(error);
  } finally {
    startDisconnectTimer();
  }
}
