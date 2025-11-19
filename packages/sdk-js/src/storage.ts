import { Storage } from './types';
import { StorageError } from './errors';

/**
 * In-memory storage implementation
 */
export class MemoryStorage implements Storage {
  private data: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) || null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

/**
 * Browser localStorage implementation
 */
export class LocalStorage implements Storage {
  private prefix: string;

  constructor(prefix: string = 'dca_auth_') {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new StorageError('localStorage is not available');
    }
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(this.getKey(key));
    } catch (error) {
      throw new StorageError(`Failed to get item from localStorage: ${error}`, 'get');
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(this.getKey(key), value);
    } catch (error) {
      throw new StorageError(`Failed to set item in localStorage: ${error}`, 'set');
    }
  }

  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(this.getKey(key));
    } catch (error) {
      throw new StorageError(`Failed to remove item from localStorage: ${error}`, 'remove');
    }
  }

  async clear(): Promise<void> {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      throw new StorageError(`Failed to clear localStorage: ${error}`, 'clear');
    }
  }
}

/**
 * Browser sessionStorage implementation
 */
export class SessionStorage implements Storage {
  private prefix: string;

  constructor(prefix: string = 'dca_auth_') {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      throw new StorageError('sessionStorage is not available');
    }
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<string | null> {
    try {
      return sessionStorage.getItem(this.getKey(key));
    } catch (error) {
      throw new StorageError(`Failed to get item from sessionStorage: ${error}`, 'get');
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      sessionStorage.setItem(this.getKey(key), value);
    } catch (error) {
      throw new StorageError(`Failed to set item in sessionStorage: ${error}`, 'set');
    }
  }

  async remove(key: string): Promise<void> {
    try {
      sessionStorage.removeItem(this.getKey(key));
    } catch (error) {
      throw new StorageError(`Failed to remove item from sessionStorage: ${error}`, 'remove');
    }
  }

  async clear(): Promise<void> {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key));
    } catch (error) {
      throw new StorageError(`Failed to clear sessionStorage: ${error}`, 'clear');
    }
  }
}

/**
 * Secure storage with encryption (for sensitive data)
 */
export class SecureStorage implements Storage {
  private storage: Storage;
  private crypto: any;

  constructor(storage: Storage, encryptionKey?: string) {
    this.storage = storage;

    // In a real implementation, you would use a proper crypto library
    // This is a simplified example
    if (typeof window !== 'undefined' && window.crypto) {
      this.crypto = window.crypto;
    }
  }

  private async encrypt(text: string): Promise<string> {
    // Simplified encryption - in production use proper encryption
    if (this.crypto && this.crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);

      // This is a placeholder - implement proper encryption
      return btoa(String.fromCharCode(...new Uint8Array(data)));
    }
    return btoa(text);
  }

  private async decrypt(encryptedText: string): Promise<string> {
    // Simplified decryption - in production use proper decryption
    if (this.crypto && this.crypto.subtle) {
      try {
        const data = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));
        const decoder = new TextDecoder();
        return decoder.decode(data);
      } catch {
        return atob(encryptedText);
      }
    }
    return atob(encryptedText);
  }

  async get(key: string): Promise<string | null> {
    const encrypted = await this.storage.get(key);
    if (!encrypted) return null;

    try {
      return await this.decrypt(encrypted);
    } catch (error) {
      throw new StorageError('Failed to decrypt data', 'decrypt');
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      const encrypted = await this.encrypt(value);
      await this.storage.set(key, encrypted);
    } catch (error) {
      throw new StorageError('Failed to encrypt data', 'encrypt');
    }
  }

  async remove(key: string): Promise<void> {
    await this.storage.remove(key);
  }

  async clear(): Promise<void> {
    await this.storage.clear();
  }
}

/**
 * Cached storage wrapper with TTL support
 */
export class CachedStorage implements Storage {
  private storage: Storage;
  private cache: Map<string, { value: string; expiry: number }> = new Map();
  private defaultTTL: number;

  constructor(storage: Storage, defaultTTL: number = 5 * 60 * 1000) {
    this.storage = storage;
    this.defaultTTL = defaultTTL;
  }

  async get(key: string): Promise<string | null> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached) {
      if (cached.expiry > Date.now()) {
        return cached.value;
      } else {
        this.cache.delete(key);
      }
    }

    // Get from underlying storage
    const value = await this.storage.get(key);
    if (value) {
      // Cache the value
      this.cache.set(key, {
        value,
        expiry: Date.now() + this.defaultTTL,
      });
    }

    return value;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    // Update cache
    this.cache.set(key, {
      value,
      expiry: Date.now() + (ttl || this.defaultTTL),
    });

    // Update underlying storage
    await this.storage.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.cache.delete(key);
    await this.storage.remove(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    await this.storage.clear();
  }

  /**
   * Clear expired cache entries
   */
  clearExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry <= now) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Storage factory
 */
export class StorageFactory {
  static create(type: 'memory' | 'local' | 'session' | 'secure' | 'cached', options?: any): Storage {
    switch (type) {
      case 'local':
        return new LocalStorage(options?.prefix);

      case 'session':
        return new SessionStorage(options?.prefix);

      case 'secure':
        const baseStorage = options?.storage || new MemoryStorage();
        return new SecureStorage(baseStorage, options?.encryptionKey);

      case 'cached':
        const underlyingStorage = options?.storage || new MemoryStorage();
        return new CachedStorage(underlyingStorage, options?.ttl);

      case 'memory':
      default:
        return new MemoryStorage();
    }
  }

  /**
   * Auto-detect best storage for environment
   */
  static auto(options?: any): Storage {
    // Browser environment
    if (typeof window !== 'undefined') {
      if (window.localStorage) {
        const localStorage = new LocalStorage(options?.prefix);

        // Use secure storage for sensitive data
        if (options?.secure) {
          return new SecureStorage(localStorage, options?.encryptionKey);
        }

        // Use cached storage for better performance
        if (options?.cached) {
          return new CachedStorage(localStorage, options?.ttl);
        }

        return localStorage;
      }
    }

    // Node.js or fallback to memory storage
    return new MemoryStorage();
  }
}