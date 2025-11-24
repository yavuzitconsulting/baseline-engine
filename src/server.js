const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const http = require('http'); // Required for exposing the server instance
const crypto = require('crypto');
const ProviderFactory = require('./engine/ai/ProviderFactory');
const MockAIService = require('./engine/MockAIService');
const SessionManager = require('./engine/SessionManager');
const GameEngine = require('./engine/GameEngine');
const redis = require('./engine/RedisClient');
const PluginManager = require('./engine/PluginManager');
const statsManager = require('./engine/StatsManager');

const app = express();
const server = http.createServer(app); // Create server explicitly to pass to plugins
const PORT = process.env.PORT || 3000;

// Redirect /editor requests to the Editor Server on port 3005
app.use('/editor', (req, res) => {
    const target = `${req.protocol}://${req.hostname}:3005${req.url}`;
    res.redirect(target);
});

// Global Logging Timestamp Override
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

function getTimestamp() {
    return new Date().toISOString();
}

console.log = (...args) => originalLog(`[${getTimestamp()}]`, ...args);
console.warn = (...args) => originalWarn(`[${getTimestamp()}]`, ...args);
console.error = (...args) => originalError(`[${getTimestamp()}]`, ...args);

// Initialize Core Systems
const sessionManager = new SessionManager();
const pluginManager = new PluginManager();

// Services
const useMock = process.env.USE_MOCK === 'true';
let aiService;

if (useMock) {
    console.log("WARNING: Running with MOCK AI Service");
    aiService = new MockAIService();
} else {
    try {
        aiService = ProviderFactory.createProvider();
    } catch (err) {
        console.error("Failed to initialize AI Provider:", err);
        process.exit(1);
    }
}

// Game Engine (now with plugin manager)
const gameEngine = new GameEngine(aiService, sessionManager, pluginManager);

// --- PLUGIN SYSTEM INITIALIZATION ---
// 1. Load Plugins
// 2. Register Plugin Static Routes (Override Core)
// 3. Execute server:init hook
(async () => {
    await pluginManager.loadPlugins();

    // Register Plugin Public Directories (Higher priority plugins first)
    // This allows plugins to override index.html or style.css
    const plugins = pluginManager.getSortedPlugins();
    for (const plugin of plugins) {
        const publicPath = path.join(plugin.dirPath, 'public');
        if (fs.existsSync(publicPath)) {
            console.log(`[Server] Registering static override for ${plugin.id}: ${publicPath}`);
            app.use(express.static(publicPath));
        }
    }

    // Core Static Files (Fallback)
    app.use(express.static(path.join(__dirname, '../public')));

    // Routes
    app.get('/play', (req, res) => {
        res.sendFile(path.join(__dirname, '../public/play.html'));
    });

    // Execute Init Hook
    await pluginManager.executeHook('broadcast', 'server:init', {
        app,
        server,
        redis,
        gameEngine
    });
})();

// Middleware
app.use(bodyParser.json());

// --- EDITOR PROXY MIDDLEWARE ---
// Proxy specific editor API requests to the Editor Server (Port 3005)
const proxyToEditor = async (req, res) => {
    const targetUrl = `http://localhost:3005${req.originalUrl}`;
    try {
        console.log(`[Proxy] Forwarding ${req.method} ${req.originalUrl} -> ${targetUrl}`);

        const options = {
            method: req.method,
            headers: { ...req.headers },
            // Use the raw body if possible, but since bodyParser consumed it, we re-stringify.
            // Note: This assumes the editor expects JSON.
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body)
        };

        // Cleanup headers
        delete options.headers['host'];
        delete options.headers['content-length'];

        const response = await fetch(targetUrl, options);

        // Forward status
        res.status(response.status);

        // Forward headers
        response.headers.forEach((val, key) => {
             res.setHeader(key, val);
        });

        // Pipe body
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));

    } catch (err) {
        console.error("[Proxy] Error:", err);
        res.status(502).json({ error: "Bad Gateway - Editor Server Unreachable" });
    }
};

// Register Proxy Routes
// These specific paths are handled by the Editor Server, but might reach Main Server
// if using a shared domain/port via Nginx routing issues.
app.use('/api/bundle', proxyToEditor);
app.use('/api/publish', proxyToEditor);
app.use('/api/auth', proxyToEditor);
app.use('/api/docs', proxyToEditor);
app.use('/api/story/*/delete', proxyToEditor);

// Request Logging Middleware
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        const timestamp = new Date().toISOString();
        console.log(`[API] ${timestamp} | ${req.method} ${req.path}`);
        if (req.method === 'POST' && req.body) {
            const safeBody = { ...req.body };
            if (safeBody.input) safeBody.input = `"${safeBody.input}"`;
            console.log(`[API] Body: ${JSON.stringify(safeBody)}`);
        }
    }
    next();
});

// Story Pre-loader
async function preloadStories() {
    const storiesPath = path.join(process.cwd(), 'stories');
    if (!fs.existsSync(storiesPath)) return;

    console.log('[Server] Preloading stories into Redis .. from ' + storiesPath);
    const stories = fs.readdirSync(storiesPath);
    console.log("stories obj: "+ stories);

    for (const storyId of stories) {
        const storyDir = path.join(storiesPath, storyId);
        if (!fs.lstatSync(storyDir).isDirectory()) continue;

        // 1. Load Manifest
        const manifestPath = path.join(storyDir, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            await redis.setJson(`story:${storyId}:manifest`, manifest);
            console.log(`   - Loaded Manifest: story:${storyId}:manifest`);
        }

        // 2. Load Nodes
        const nodesDir = path.join(storyDir, 'nodes');
        if (fs.existsSync(nodesDir)) {
            const nodes = fs.readdirSync(nodesDir);
            for (const nodeFile of nodes) {
                if (!nodeFile.endsWith('.json')) continue;
                const nodeId = path.basename(nodeFile, '.json');
                const nodePath = path.join(nodesDir, nodeFile);
                const nodeData = JSON.parse(fs.readFileSync(nodePath, 'utf8'));
                await redis.setJson(`story:${storyId}:node:${nodeId}`, nodeData);
                console.log(`   - Loaded Node: story:${storyId}:node:${nodeId}`);
            }
            console.log(`   - Loaded ${nodes.length} nodes for ${storyId}`);
        }
    }
    console.log('[Server] Story preload complete.');
}


// Security Middleware: Verify CSRF Token
async function verifyCsrf(req, res, next) {
    const sessionId = req.body.sessionId || req.query.sessionId;
    const token = req.headers['x-csrf-token'];

    if (!sessionId) {
        return res.status(400).json({ error: "Missing sessionId for CSRF check" });
    }

    // Bypass for start? No, start doesn't have a session yet usually.
    // This middleware is intended for endpoints that REQUIRE a session.

    try {
        const session = await sessionManager.getSession(sessionId);
        if (!session) {
             return res.status(401).json({ error: "Invalid session" });
        }

        if (!session.csrfToken) {
             // If session exists but no token (legacy?), maybe allow or fail?
             // Let's generate one if missing? No, that defeats the purpose.
             // Fail safe.
             return res.status(403).json({ error: "Session missing security token. Please refresh." });
        }

        if (session.csrfToken !== token) {
            console.warn(`[Security] CSRF Mismatch for session ${sessionId}. Expected ${session.csrfToken}, got ${token}`);
            return res.status(403).json({ error: "Invalid security token" });
        }

        next();
    } catch (err) {
        console.error("[Security] CSRF Check Error:", err);
        res.status(500).json({ error: "Security check failed" });
    }
}


// API Routes

// Generate CSRF Token
app.get('/api/csrf-token', async (req, res) => {
    const { sessionId } = req.query;
    if (!sessionId) {
        return res.status(400).json({ error: "Missing sessionId" });
    }

    try {
        const session = await sessionManager.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }

        // Generate new token if not exists, or return existing?
        // Usually returning existing is fine for SPA.
        // Rotating it on every get is safer but requires frontend synchronization.
        let token = session.csrfToken;
        if (!token) {
            token = crypto.randomBytes(32).toString('hex');
            session.csrfToken = token;
            await sessionManager.saveSession(sessionId, session);
        }

        res.json({ csrfToken: token });
    } catch (error) {
        console.error(`[Server] ERROR in /api/csrf-token:`, error);
        res.status(500).json({ error: error.message });
    }
});

// List all stories
app.get('/api/stories', async (req, res) => {
    try {
        const storiesPath = path.join(process.cwd(), 'stories');
        if (!fs.existsSync(storiesPath)) return res.json([]);

        const stories = fs.readdirSync(storiesPath);
        const result = [];

        for (const storyId of stories) {
            const storyDir = path.join(storiesPath, storyId);
            if (!fs.lstatSync(storyDir).isDirectory()) continue;

            // Try to get manifest from Redis first for speed
            let manifest = await redis.getJson(`story:${storyId}:manifest`);

            // Fallback to file if not in Redis (though preload should catch it)
            if (!manifest) {
                 const manifestPath = path.join(storyDir, 'manifest.json');
                 if (fs.existsSync(manifestPath)) {
                     manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                 }
            }

            if (manifest) {
                result.push(manifest);
            }
        }
        res.json(result);
    } catch (error) {
        console.error(`[Server] ERROR in /api/stories:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Start a new session
app.post('/api/start', async (req, res) => {
    try {
        console.log(`[Server] Starting new session request...`);
        const { storyId } = req.body;
        const sessionId = await sessionManager.createSession();

        // Plugin Hook: session:create (if needed, but startStory is usually where it happens)

        const targetStory = storyId || 'protocol_01';
        const result = await gameEngine.startStory(sessionId, targetStory);
        console.log(`[Server] Session ${sessionId} started successfully for story ${targetStory}.`);
        res.json({ sessionId, ...result });
    } catch (error) {
        console.error(`[Server] ERROR in /api/start:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Interact with the game
app.post('/api/interact', async (req, res) => {
    const { sessionId, input } = req.body;
    if (!sessionId || !input) {
        return res.status(400).json({ error: "Missing sessionId or input" });
    }

    try {
        const result = await gameEngine.handleInput(sessionId, input);
        res.json(result);
    } catch (error) {
        console.error(`[Server] ERROR in /api/interact for session ${sessionId}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Get available intents for correction
app.get('/api/intents', async (req, res) => {
    const { sessionId } = req.query;
    if (!sessionId) {
        return res.status(400).json({ error: "Missing sessionId" });
    }
    try {
        const intents = await gameEngine.getAvailableIntents(sessionId);
        res.json(intents);
    } catch (error) {
        console.error(`[Server] ERROR in /api/intents for session ${sessionId}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Submit intent correction
app.post('/api/correct-intent', verifyCsrf, async (req, res) => {
    const { sessionId, input, correctIntentId } = req.body;
    if (!sessionId || !input || !correctIntentId) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        const session = await sessionManager.getSession(sessionId);
        if (!session) return res.status(404).json({ error: "Session not found" });

        // 1. Time Limit Check (60 seconds)
        const TIME_LIMIT = 60000;
        if (!session.lastInputTimestamp || (Date.now() - session.lastInputTimestamp > TIME_LIMIT)) {
             return res.status(400).json({ error: "Correction time limit expired" });
        }

        // 2. Input Match Check (Ensure we are correcting the latest input)
        // We must sanitize the incoming input exactly like the engine does to match the session record
        const sanitizedInput = input.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
        if (session.lastInput !== sanitizedInput) {
            return res.status(400).json({ error: "Can only correct the most recent input" });
        }

        // 3. Update Cache
        // Reconstruct the key
        const intentCacheKey = `intent_cache:${session.currentStory}:${session.currentNodeId}:${sanitizedInput}`;

        // Security: Sanitize correctIntentId to prevent cache pollution
        if (!/^[a-zA-Z0-9_]+$/.test(correctIntentId)) {
            return res.status(400).json({ error: "Invalid Intent ID format" });
        }

        await redis.set(intentCacheKey, correctIntentId);

        console.log(`[Server] CORRECTION APPLIED: ${sanitizedInput} -> ${correctIntentId}`);

        // Execute the intent immediately
        const gameResponse = await gameEngine.handleInput(sessionId, input);

        res.json({ success: true, message: "Intent recalibrated.", gameResponse });

    } catch (error) {
        console.error(`[Server] ERROR in /api/correct-intent:`, error);
        res.status(500).json({ error: error.message });
    }
});

// --- STATS ENDPOINTS ---

// Register a visit
app.post('/api/visit', (req, res) => {
    const { visitorId } = req.body;
    if (!visitorId) return res.status(400).json({ error: "Missing visitorId" });

    // Use StatsManager to buffer writes
    statsManager.recordVisit(visitorId);
    res.json({ success: true });
});

// Get Stats
app.get('/api/stats', (req, res) => {
    // Return cached stats immediately
    res.json(statsManager.getStats());
});

// Start Server
server.listen(PORT, async () => {
    // Ensure Redis is connected before preloading
    await redis.connect();

    // Initialize Stats Manager
    await statsManager.init();

    await preloadStories();

    console.log(`
    ==========================================
    BASELINE ENGINE ONLINE
    PORT: ${PORT}
    MODE: ${process.env.NODE_ENV || 'development'}
    AI PROVIDER: ${process.env.AI_PROVIDER || 'ollama'}

    Access the app at: http://localhost:${PORT}
    ==========================================
    `);
});
