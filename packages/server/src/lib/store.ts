export class Store {
  private store: Map<string, any>;
  constructor() {
    this.store = new Map();
  }

  set(key: string, value: any, ttl = 0) {
    const item = {
      value,
      expiresAt: ttl > 0 ? Date.now() + ttl : null
    };

    this.store.set(key, item);

    if (ttl > 0) {
      setTimeout(() => {
        this.delete(key);
      }, ttl);
    }
  }

  get<T = any>(key: string) {
    const item = this.store.get(key);

    if (!item) {
      return null;
    }

    if (item.expiresAt && item.expiresAt < Date.now()) {
      this.delete(key);
      return null;
    }

    return item.value as T;
  }

  delete(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  has(key: string) {
    return this.store.has(key);
  }

  size() {
    return this.store.size;
  }
}
