const { v4: uuidv4 } = require('uuid');
const redis = require('./RedisClient');

class SessionManager {
    constructor() {
        // No longer need local fs storage for sessions
        this.redis = redis;
    }

    async createSession(id = null) {
        const sessionId = id || uuidv4();
        const initialSession = {
            id: sessionId,
            currentStory: null,
            currentNodeId: null,
            history: [],
            state: {},
            visitedNodes: [],
            failCount: 0,
            inventory: [],
            revealedItems: []
        };

        await this.saveSession(sessionId, initialSession);
        return sessionId;
    }

    async getSession(sessionId) {
        if (!this.isValidSessionId(sessionId)) return null;

        // Try to get from Redis
        let session = await this.redis.getJson(`session:${sessionId}`);

        if (!session) {
            // Do not auto-create session. Let the GameEngine handle missing sessions.
            console.warn(`[SessionManager] Session ${sessionId} not found in Redis.`);
            return null;
        }

        return session;
    }

    async saveSession(sessionId, data) {
        if (!this.isValidSessionId(sessionId)) throw new Error("Invalid Session ID");
        await this.redis.setJson(`session:${sessionId}`, data);
    }

    async deleteSession(sessionId) {
        if (!this.isValidSessionId(sessionId)) return;
        await this.redis.del(`session:${sessionId}`);
        console.log(`[SessionManager] Deleted session: ${sessionId}`);
    }

    async archiveSession(sessionId) {
        if (!this.isValidSessionId(sessionId)) return;
        try {
            await this.redis.rename(`session:${sessionId}`, `disabled_session:${sessionId}`);
            console.log(`[SessionManager] Archived session: ${sessionId}`);
        } catch (err) {
            console.warn(`[SessionManager] Failed to archive session ${sessionId}: ${err.message}`);
        }
    }

    isValidSessionId(id) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    }
}

module.exports = SessionManager;
