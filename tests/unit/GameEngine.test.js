const GameEngine = require('../../src/engine/GameEngine');
const redis = require('../../src/engine/RedisClient');

// Mock RedisClient
jest.mock('../../src/engine/RedisClient', () => ({
    getJson: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    setJson: jest.fn()
}));

describe('GameEngine', () => {
    let gameEngine;
    let mockAiService;
    let mockSessionManager;

    const mockManifest = {
        startNode: "start"
    };

    const mockStartNode = {
        id: "start",
        text: "Start Node Text",
        text_revisit: "Start Node Visited Text",
        intents: [
            { id: "go_next", ai_intent_helper: "Go to next room", intent_description: "Go Next", action: "transition", target: "next" },
            { id: "look", ai_intent_helper: "Look around", intent_description: "Look", action: "text", response: "You see nothing." },
            { id: "quit", ai_intent_helper: "Quit game", intent_description: "Quit", action: "end_game", response: "Bye." }
        ]
    };

    const mockNextNode = {
        id: "next",
        text: "Next Node Text",
        intents: [
            { id: "go_back", ai_intent_helper: "Go back to start", intent_description: "Go Back", action: "transition", target: "start" }
        ]
    };

    beforeEach(() => {
        mockAiService = {
            classifyIntent: jest.fn()
        };
        mockSessionManager = {
            getSession: jest.fn(),
            saveSession: jest.fn(),
            deleteSession: jest.fn()
        };

        gameEngine = new GameEngine(mockAiService, mockSessionManager);

        // Mock Redis Responses
        redis.getJson.mockImplementation(async (key) => {
            if (key === 'story:test_story:manifest') return mockManifest;
            if (key === 'story:test_story:node:start') return mockStartNode;
            if (key === 'story:test_story:node:next') return mockNextNode;
            return null;
        });
    });

    test('should start a story correctly and mark visited', async () => {
        const sessionId = '123';
        // Mock getSession to return null (new session)
        mockSessionManager.getSession.mockResolvedValue(null);

        const result = await gameEngine.startStory(sessionId, 'test_story');

        expect(result.text).toBe("Start Node Text");
        // Check saveSession was called with new session
        expect(mockSessionManager.saveSession).toHaveBeenCalledWith(sessionId, expect.objectContaining({
             visitedNodes: ["start"]
        }));
    });

    test('should use revisit text on second visit', async () => {
        const sessionId = '123';
        const mockSession = { currentStory: 'test_story', currentNodeId: 'next', visitedNodes: ['start', 'next'], failCount: 0 };
        mockSessionManager.getSession.mockResolvedValue(mockSession);

        // Assume intent is already cached or AI returns it
        redis.get.mockResolvedValue('go_back');

        const result = await gameEngine.handleInput(sessionId, "go back");

        expect(result.text).toBe("Start Node Visited Text");
        // Should transition session to 'start'
        expect(mockSession.currentNodeId).toBe('start');
    });

    test('should give hint after 3 failures', async () => {
        const sessionId = '123';
        const mockSession = { currentStory: 'test_story', currentNodeId: 'start', visitedNodes: ['start'], failCount: 2 };
        mockSessionManager.getSession.mockResolvedValue(mockSession);

        // Ensure cache miss
        redis.get.mockResolvedValue(null);
        mockAiService.classifyIntent.mockResolvedValue('unknown');

        const result = await gameEngine.handleInput(sessionId, "fail");

        // Should trigger the 3rd fail
        expect(result.text).toContain("TIP:");
    });
});
