import * as mongoose from 'mongoose';

let timer: Timer
let isConnected = false

export async function initConnect() {
  if (isConnected) return
  await mongoose.connect('mongodb://127.0.0.1:27017/mongoose-app');
  isConnected = true
}

export async function exec<T extends (...args: any[]) => any>(fn: T) {
  await initConnect();
  if (timer) clearTimeout(timer);

  try {
    const result: ReturnType<T> = await fn();
    return result;
  } catch (error) {
    console.error(error);
  } finally {
    timer = setTimeout(async () => {
      await mongoose.disconnect();
      isConnected = false
    }, 1000 * 10);
  }

}
