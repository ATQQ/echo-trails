import * as mongoose from 'mongoose';

export async function initConnect() {
  await mongoose.connect('mongodb://127.0.0.1:27017/mongoose-app');

  return async function closeConnection() {
    await mongoose.disconnect();
  }
}

export async function exec<T extends (...args: any[]) => any>(fn: T) {
  const closeConnection = await initConnect();
  try {
    const result: ReturnType<T> = await fn();
    await closeConnection();
    return result;
  } catch (error) {
    console.error(error);
  }
  await closeConnection();
}
