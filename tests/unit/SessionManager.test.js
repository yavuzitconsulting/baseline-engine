const SessionManager = require('../../src/engine/SessionManager');
const { v4: uuidv4 } = require('uuid');
const redis = require('../../src/engine/RedisClient');

// Mock Redis Client
jest.mock('../../src/engine/RedisClient', () => ({
    getJson: jest.fn(),
    setJson: jest.fn(),
    del: jest.fn()
}));

describe('SessionManager', () => {
    let sessionManager;

    beforeEach(() => {
        sessionManager = new SessionManager();
        jest.clearAllMocks();
    });

    test('should validate session IDs correctly', () => {
        const validId = uuidv4();
        const invalidId = '../etc/passwd';

        expect(sessionManager.isValidSessionId(validId)).toBe(true);
        expect(sessionManager.isValidSessionId(invalidId)).toBe(false);
        expect(sessionManager.isValidSessionId('not-a-uuid')).toBe(false);
    });

    test('should save a valid session', async () => {
        const validId = uuidv4();
        const data = { state: 'test' };

        await sessionManager.saveSession(validId, data);

        expect(redis.setJson).toHaveBeenCalledWith(
            `session:${validId}`,
            data
        );
    });

    test('should throw error when saving with invalid ID', async () => {
        const invalidId = 'hack';
        await expect(sessionManager.saveSession(invalidId, {})).rejects.toThrow("Invalid Session ID");
    });

    test('should load a valid session', async () => {
        const validId = uuidv4();
        const mockData = { state: 'loaded' };
        redis.getJson.mockResolvedValue(mockData);

        const session = await sessionManager.getSession(validId);
        expect(session).toEqual(mockData);
        expect(redis.getJson).toHaveBeenCalledWith(`session:${validId}`);
    });

    test('should return null for invalid ID load attempt', async () => {
        const invalidId = 'hack';
        const session = await sessionManager.getSession(invalidId);
        expect(session).toBeNull();
    });

    test('should return null if session is not found in Redis', async () => {
        const validId = uuidv4();
        redis.getJson.mockResolvedValue(null); // Simulate cache miss

        const session = await sessionManager.getSession(validId);
        expect(session).toBeNull();
        // Ensure we don't auto-create anymore
        expect(redis.setJson).not.toHaveBeenCalled();
    });
});
