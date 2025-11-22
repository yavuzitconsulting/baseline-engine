const GameEngine = require('../../src/engine/GameEngine');
const redis = require('../../src/engine/RedisClient');

// Mock Redis
jest.mock('../../src/engine/RedisClient', () => ({
    getJson: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    setJson: jest.fn()
}));

describe('GameEngine Regression Tests', () => {
    let gameEngine;
    let mockAiService;
    let mockSessionManager;

    beforeEach(() => {
        mockAiService = {
            classifyIntent: jest.fn()
        };
        mockSessionManager = {
            getSession: jest.fn(),
            saveSession: jest.fn()
        };

        gameEngine = new GameEngine(mockAiService, mockSessionManager);
    });

    test('should handle legacy session without visitedNodes', async () => {
        // Setup Legacy Session
        const legacySession = {
            id: 'legacy',
            currentStory: 'test',
            currentNodeId: 'start',
            // visitedNodes is missing
            inventory: []
        };

        mockSessionManager.getSession.mockResolvedValue(legacySession);

        // Mock Node
        const mockNode = {
            id: 'start',
            text: "Legacy Node",
            intents: []
        };
        redis.getJson.mockResolvedValue(mockNode);

        // Mock AI
        mockAiService.classifyIntent.mockResolvedValue('unknown');
        redis.get.mockResolvedValue(null); // Cache miss

        const result = await gameEngine.handleInput('legacy', 'test');

        // Should not crash, should initialize visitedNodes
        expect(legacySession.visitedNodes).toBeDefined();
        expect(legacySession.visitedNodes).toContain('start');
    });
});
