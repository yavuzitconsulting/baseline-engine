const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');
const nock = require('nock');
const path = require('path');
const fs = require('fs');
const redis = require('../../src/engine/RedisClient');

// Services
const AIService = require('../../src/engine/AIService');
const SessionManager = require('../../src/engine/SessionManager');
const GameEngine = require('../../src/engine/GameEngine');

// Setup App
const app = express();
app.use(bodyParser.json());

// Services
const aiService = new AIService('test_model', 'http://mock-ollama:11434');
const sessionManager = new SessionManager(); // No fs arg needed now
const gameEngine = new GameEngine(aiService, sessionManager);

app.post('/api/start', async (req, res) => {
    try {
        const sessionId = await sessionManager.createSession();
        const result = await gameEngine.startStory(sessionId, 'protocol_01');
        res.json({ sessionId, ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/interact', async (req, res) => {
    try {
        const { sessionId, input } = req.body;
        const result = await gameEngine.handleInput(sessionId, input);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

describe('Server Integration', () => {
    let sessionId;

    beforeAll(async () => {
        // Connect Redis
        await redis.connect();

        // Seed Redis with Protocol 01 data
        const mockManifest = {
             id: "protocol_01",
             startNode: "intro"
        };
        const mockIntroNode = {
            id: "intro",
            text: "Protocol 01 Intro Text",
            intents: [
                { id: "examine_gear", description: "Examine gear", action: "text", response: "You examine your Hazard Suit." }
            ]
        };

        await redis.setJson('story:protocol_01:manifest', mockManifest);
        await redis.setJson('story:protocol_01:node:intro', mockIntroNode);

        // Mock the AI Service startup check
        nock('http://mock-ollama:11434')
            .get('/api/tags')
            .reply(200, { models: [{ name: 'test_model' }] });
    });

    afterAll(async () => {
        nock.cleanAll();
        await redis.quit();
    });

    test('POST /api/start should start a session', async () => {
        const res = await request(app).post('/api/start');
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('sessionId');
        expect(res.body).toHaveProperty('text');
        expect(res.body.type).toBe('intro');
        sessionId = res.body.sessionId;
    });

    test('POST /api/interact should return a response', async () => {
        // Mock the Ollama generation call
        nock('http://mock-ollama:11434')
            .post('/api/generate')
            .reply(200, { response: 'examine_gear' });

        const res = await request(app)
            .post('/api/interact')
            .send({ sessionId, input: 'check gear' });

        expect(res.statusCode).toEqual(200);
        expect(res.body.type).toBe('info'); // intro node 'examine_gear' is type info/text
        expect(res.body.text).toContain('Hazard Suit');
    });
});
