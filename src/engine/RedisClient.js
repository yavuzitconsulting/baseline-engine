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
        this.expirations = new Map(); // Store timeouts for memory store

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
        const val = this.memoryStore.get(key);
        return (typeof val === 'string') ? val : null;
    }

    async set(key, value) {
        if (this.connected) {
            return await this.client.set(key, value);
        }
        this.memoryStore.set(key, value);
        // Clear any existing expiration if overwritten
        if (this.expirations.has(key)) {
            clearTimeout(this.expirations.get(key));
            this.expirations.delete(key);
        }
        return 'OK';
    }

    async del(key) {
        if (this.connected) {
            return await this.client.del(key);
        }
        this.memoryStore.delete(key);
        if (this.expirations.has(key)) {
            clearTimeout(this.expirations.get(key));
            this.expirations.delete(key);
        }
        return 1;
    }

    async setJson(key, value) {
        const str = JSON.stringify(value);
        if (this.connected) {
            return await this.client.set(key, str);
        }
        this.memoryStore.set(key, str);
        if (this.expirations.has(key)) {
            clearTimeout(this.expirations.get(key));
            this.expirations.delete(key);
        }
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
            return (data && typeof data === 'string') ? JSON.parse(data) : null;
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
            // Move expiration? simpler to just clear it
            if (this.expirations.has(key)) {
                clearTimeout(this.expirations.get(key));
                this.expirations.delete(key);
            }
            return 'OK';
        }
        throw new Error('ERR no such key');
    }

    async sAdd(key, value) {
        if (this.connected) {
            // handle array of values (spread)
            if (Array.isArray(value)) {
                if (value.length === 0) return 0;
                return await this.client.sAdd(key, value);
            }
            return await this.client.sAdd(key, value);
        }
        let set = this.memoryStore.get(key);
        if (!(set instanceof Set)) {
            set = new Set();
        }

        let addedCount = 0;
        if (Array.isArray(value)) {
            value.forEach(v => {
                if (!set.has(v)) {
                    set.add(v);
                    addedCount++;
                }
            });
        } else {
            if (!set.has(value)) {
                set.add(value);
                addedCount = 1;
            }
        }

        this.memoryStore.set(key, set);
        return addedCount;
    }

    async sCard(key) {
        if (this.connected) {
            return await this.client.sCard(key);
        }
        const set = this.memoryStore.get(key);
        return (set instanceof Set) ? set.size : 0;
    }

    async countKeys(pattern) {
    if (this.connected) {
        let count = 0;
        let cursor = "0";

        do {
            const result = await this.client.scan(cursor, {
                MATCH: pattern,
                COUNT: 100
            });

            cursor = result.cursor;     // string
            count += result.keys.length;
        } while (cursor !== "0");

        return count;
    }

    // In-memory fallback
    let count = 0;
    const regexStr = '^' + pattern.replace(/\*/g, '.*') + '$';
    const regex = new RegExp(regexStr);

    for (const key of this.memoryStore.keys()) {
        if (regex.test(key)) count++;
    }
    return count;
}


    async expire(key, seconds) {
        if (this.connected) {
        return await this.client.expire(key, String(seconds));
    }

        if (this.memoryStore.has(key)) {
            if (this.expirations.has(key)) {
                clearTimeout(this.expirations.get(key));
            }
            const timeout = setTimeout(() => {
                this.memoryStore.delete(key);
                this.expirations.delete(key);
            }, seconds * 1000);
            this.expirations.set(key, timeout); // Prevent blocking process exit
            timeout.unref();
            return 1;
        }
        return 0;
    }

    async quit() {
        if (this.connected) {
            await this.client.quit();
        }
        // Clear memory store timeouts
        for (const timeout of this.expirations.values()) {
            clearTimeout(timeout);
        }
        this.expirations.clear();
    }
}

// Singleton instance
const instance = new RedisClient();

module.exports = instance;
