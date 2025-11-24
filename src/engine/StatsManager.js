const redis = require('./RedisClient');
const fs = require('fs');
const path = require('path');

class StatsManager {
    constructor() {
        this.cachedStats = {
            uniqueVisitors: 0,
            visitorsToday: 0,
            visitorsWeek: 0,
            visitorsMonth: 0,
            activeSessions: 0,
            cachedMessages: 0,
            totalStories: 0,
            forkedStories: 0
        };

        this.pendingVisits = new Set();
        this.flushInterval = null;
        this.refreshInterval = null;
    }

    async init() {
        // Initial load
        await this._refreshStats();

        // Flush writes every 60 seconds
        this.flushInterval = setInterval(() => this._flushVisits(), 60 * 1000);
        this.flushInterval.unref(); // Don't block exit

        // Refresh cache every 5 minutes
        this.refreshInterval = setInterval(() => this._refreshStats(), 5 * 60 * 1000);
        this.refreshInterval.unref();

        console.log('[StatsManager] Initialized. Background tasks started.');
    }

    recordVisit(visitorId) {
        if (!visitorId) return;
        this.pendingVisits.add(visitorId);
    }

    getStats() {
        return this.cachedStats;
    }

    async _flushVisits() {
        if (this.pendingVisits.size === 0) return;

        const visitors = Array.from(this.pendingVisits);
        this.pendingVisits.clear(); // Clear immediately to avoid double processing if async hangs

        try {
            const now = new Date();
            const date = now.toISOString().split('T')[0];

            const startOfYear = new Date(now.getFullYear(), 0, 1);
            const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
            const weekNum = Math.ceil((startOfYear.getDay() + 1 + days) / 7);
            const week = `${now.getFullYear()}-${weekNum}`;

            const month = date.substring(0, 7);

            // Batch writes
            await redis.sAdd('stats:visitors:all', visitors);

            const dailyKey = `stats:visitors:daily:${date}`;
            await redis.sAdd(dailyKey, visitors);
            await redis.expire(dailyKey, 60 * 60 * 48);

            const weeklyKey = `stats:visitors:weekly:${week}`;
            await redis.sAdd(weeklyKey, visitors);
            await redis.expire(weeklyKey, 60 * 60 * 24 * 14);

            const monthlyKey = `stats:visitors:monthly:${month}`;
            await redis.sAdd(monthlyKey, visitors);
            await redis.expire(monthlyKey, 60 * 60 * 24 * 60);

            console.log(`[StatsManager] Flushed ${visitors.length} visits to Redis.`);
        } catch (err) {
            console.error('[StatsManager] Error flushing visits:', err);
            // Re-add to pending? No, risk of memory leak. Drop data is safer for stats.
        }
    }

    async _refreshStats() {
        try {
            const now = new Date();
            const date = now.toISOString().split('T')[0];
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
            const weekNum = Math.ceil((startOfYear.getDay() + 1 + days) / 7);
            const week = `${now.getFullYear()}-${weekNum}`;
            const month = date.substring(0, 7);

            // Parallel Redis Queries
            const [
                uniqueVisitors,
                visitorsToday,
                visitorsWeek,
                visitorsMonth,
                activeSessions,
                cachedMessages
            ] = await Promise.all([
                redis.sCard('stats:visitors:all'),
                redis.sCard(`stats:visitors:daily:${date}`),
                redis.sCard(`stats:visitors:weekly:${week}`),
                redis.sCard(`stats:visitors:monthly:${month}`),
                redis.countKeys('session:*'),
                redis.countKeys('intent_cache:*')
            ]);

            // File System Stats
            const { totalStories, forkedStories } = await this._getStoryStats();

            this.cachedStats = {
                uniqueVisitors,
                visitorsToday,
                visitorsWeek,
                visitorsMonth,
                activeSessions,
                cachedMessages,
                totalStories,
                forkedStories
            };

            // console.log('[StatsManager] Stats refreshed.'); // Verbose
        } catch (err) {
            console.error('[StatsManager] Error refreshing stats:', err);
        }
    }

    async _getStoryStats() {
        const storiesPath = path.join(process.cwd(), 'stories');
        let totalStories = 0;
        let forkedStories = 0;

        try {
            await fs.promises.access(storiesPath);
            const stories = await fs.promises.readdir(storiesPath);

            for (const storyId of stories) {
                const storyDir = path.join(storiesPath, storyId);

                try {
                    const stats = await fs.promises.lstat(storyDir);
                    if (!stats.isDirectory()) continue;

                    totalStories++;

                    const manifestPath = path.join(storyDir, 'manifest.json');
                    try {
                        const manifestContent = await fs.promises.readFile(manifestPath, 'utf8');
                        const manifest = JSON.parse(manifestContent);
                        if (manifest.originalStoryId) {
                            forkedStories++;
                        }
                    } catch (e) {
                         // ignore
                    }
                } catch (e) {
                    continue;
                }
            }
        } catch (e) {
            // ignore
        }
        return { totalStories, forkedStories };
    }
}

module.exports = new StatsManager();
