const { createClient } = require('redis');

class RedisClient {
    constructor() {
        const host = process.env.REDIS_HOST || 'localhost';
        const port = process.env.REDIS_PORT || 6379;

        this.client = createClient({
            url: `redis://${host}:${port}`
        });

        this.connected = false;
        this.memoryStore = new Map();

        this.client.on('error', (err) => {
            // console.error('[Redis] Client Error', err.message);
            this.connected = false;
        });

        this.client.on('connect', () => {
            console.log('[Redis] Connected to Redis');
            this.connected = true;
        });
    }

    async connect() {
        if (process.env.NODE_ENV === 'test') {
            console.warn('[Redis] Test environment detected. Skipping connection, using In-Memory Store.');
            this.connected = false;
            return;
        }
        try {
            // Set a timeout for connection
            const connectPromise = this.client.connect();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Connection timed out')), 2000)
            );

            await Promise.race([connectPromise, timeoutPromise]);
            this.connected = true;
        } catch (err) {
            console.warn(`[Redis] Connection failed (${err.message}), falling back to In-Memory Store.`);
            this.connected = false;
        }
    }

    async get(key) {
        if (this.connected) {
            return await this.client.get(key);
        }
        return this.memoryStore.get(key) || null;
    }

    async set(key, value) {
        if (this.connected) {
            return await this.client.set(key, value);
        }
        this.memoryStore.set(key, value);
        return 'OK';
    }

    async del(key) {
        if (this.connected) {
            return await this.client.del(key);
        }
        this.memoryStore.delete(key);
        return 1;
    }

    async setJson(key, value) {
        const str = JSON.stringify(value);
        if (this.connected) {
            return await this.client.set(key, str);
        }
        this.memoryStore.set(key, str);
        return 'OK';
    }

    async getJson(key) {
        let data;
        if (this.connected) {
            data = await this.client.get(key);
        } else {
            data = this.memoryStore.get(key);
        }

        try {
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error(`[Redis] Failed to parse JSON for key ${key}`, e);
            return null;
        }
    }

    async rename(key, newKey) {
        if (this.connected) {
            return await this.client.rename(key, newKey);
        }

        const val = this.memoryStore.get(key);
        if (val !== undefined) {
            this.memoryStore.set(newKey, val);
            this.memoryStore.delete(key);
            return 'OK';
        }
        throw new Error('ERR no such key');
    }

    async quit() {
        if (this.connected) {
            await this.client.quit();
        }
    }
}

// Singleton instance
const instance = new RedisClient();
// Object.freeze(instance); // Removed to allow state updates (connected flag)

module.exports = instance;
