import mongoose from 'mongoose';
import { Context, Next } from 'hono';

const dbName = process.env.DB_NAME || 'echo-trails-app';
const uri = `mongodb://127.0.0.1:27017/${dbName}`;

// Add connection event listeners
mongoose.connection.on('connected', () => {
  console.log(`Mongoose connected to ${uri}`);
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

export async function initConnect() {
  // 0: disconnected, 1: connected, 2: connecting, 3: disconnecting
  if (mongoose.connection.readyState === 1) {
    return;
  }

  // If currently connecting, return the existing promise if possible, 
  // or just let mongoose handle it (calling connect again returns the same promise)
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
}

export async function dbMiddleware(c: Context, next: Next) {
  await initConnect();
  await next();
}

export async function exec<T extends (...args: any[]) => any>(fn: T) {
  await initConnect();

  try {
    const result: ReturnType<T> = await fn();
    return result;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
