const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');
const GameEngine = require('../../src/engine/GameEngine');
const SessionManager = require('../../src/engine/SessionManager');
const MockAIService = require('../../src/engine/MockAIService');
const redis = require('../../src/engine/RedisClient');

// Mock Redis
jest.mock('../../src/engine/RedisClient', () => {
    const store = new Map();
    return {
        get: jest.fn(async (key) => store.get(key)),
        set: jest.fn(async (key, val) => store.set(key, val)),
        getJson: jest.fn(async (key) => {
            const val = store.get(key);
            return val ? JSON.parse(val) : null;
        }),
        setJson: jest.fn(async (key, val) => store.set(key, JSON.stringify(val))),
        connect: jest.fn(),
        quit: jest.fn(),
        _store: store // exposure for test setup
    };
});

describe('Optimization Flag Integration Test', () => {
    let app;
    let gameEngine;
    let sessionManager;
    let aiService;
    let sessionId;

    beforeAll(async () => {
        app = express();
        app.use(bodyParser.json());

        sessionManager = new SessionManager();
        aiService = new MockAIService();
        gameEngine = new GameEngine(aiService, sessionManager, null);

        // Setup routes
        app.post('/api/start', async (req, res) => {
            const sId = await sessionManager.createSession();
            const result = await gameEngine.startStory(sId, 'test_story');
            res.json({ sessionId: sId, ...result });
        });

        app.post('/api/interact', async (req, res) => {
            const { sessionId, input } = req.body;
            const result = await gameEngine.handleInput(sessionId, input);
            res.json(result);
        });
    });

    beforeEach(async () => {
        redis._store.clear();

        // Setup a mock story manifest and node in "Redis"
        const manifest = { startNode: 'node1' };
        const node1 = {
            id: 'node1',
            text: 'You are in a test room.',
            intents: [
                { id: 'examine_gear', description: 'examine gear', action: 'text', response: 'Your gear is fine.' }
            ]
        };

        await redis.setJson('story:test_story:manifest', manifest);
        await redis.setJson('story:test_story:node:node1', node1);

        // Create session
        const res = await request(app).post('/api/start');
        sessionId = res.body.sessionId;
    });

    test('Cache Miss (AI) returns optimized: true', async () => {
        // Clear cache
        redis.get.mockClear();

        const res = await request(app)
            .post('/api/interact')
            .send({ sessionId, input: 'examine gear' });

        expect(res.body.text).toContain('Your gear is fine');
        expect(res.body.optimized).toBe(true);
    });

    test('Cache Hit (Redis) returns optimized: false', async () => {
        // 1. First call (Miss -> Cache)
        await request(app)
            .post('/api/interact')
            .send({ sessionId, input: 'examine gear' });

        // 2. Second call (Hit)
        const res = await request(app)
            .post('/api/interact')
            .send({ sessionId, input: 'examine gear' });

        expect(res.body.text).toContain('Your gear is fine');
        expect(res.body.optimized).toBe(false);
    });
});
