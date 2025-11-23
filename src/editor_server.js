const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const redis = require('./engine/RedisClient');
const crypto = require('crypto');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const app = express();
const PORT = 3005;
const STORIES_DIR = path.join(process.cwd(), 'stories');
const DISABLED_STORIES_DIR = path.join(process.cwd(), 'disabled_stories');
const DOCS_PATH = path.join(process.cwd(), 'docs/MAP_CREATION_GUIDE.md');

app.use(bodyParser.json({ limit: '10mb' })); // Decrease limit to prevent DoS
app.use(express.static(path.join(process.cwd(), 'public/editor')));

// --- AUTHENTICATION & REDIS ---

async function seedReservedUser() {

    const USERNAME = ADMIN_USERNAME || 'somedude';
    const PASSWORD = process.env.ADMIN_PASSWORD || 'somepassword';

    const userKey = `user:${USERNAME}:hash`;
    const existing = await redis.get(userKey);

    if (!existing) {
        console.log(`[Auth] Seeding reserved user: ${USERNAME}`);
        const hash = await bcrypt.hash(PASSWORD, 10);
        await redis.set(userKey, hash);
    } else {
        console.log(`[Auth] Reserved user ${USERNAME} exists.`);
    }
}

// Simple Session Middleware
async function getSession(req) {
    const token = req.headers['x-editor-token'];
    if (!token) return null;
    const sessionData = await redis.getJson(`editor_session:${token}`);
    return sessionData;
}

async function requireAuth(req, res, next) {
    const user = await getSession(req);
    if (!user) {
        return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    req.user = user;
    next();
}

// API: Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Missing credentials" });

        const hash = await redis.get(`user:${username}:hash`);
        if (!hash) return res.status(401).json({ error: "Invalid credentials" });

        const match = await bcrypt.compare(password, hash);
        if (!match) return res.status(401).json({ error: "Invalid credentials" });

        // Create Session
        const token = crypto.randomBytes(32).toString('hex');
        const csrfToken = crypto.randomBytes(32).toString('hex');
        await redis.setJson(`editor_session:${token}`, { username, csrfToken }, { EX: 86400 }); // 24h

        res.json({ success: true, token, username, csrfToken });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// CSRF Middleware
async function verifyEditorCsrf(req, res, next) {
    const token = req.headers['x-editor-token'];
    const csrfTokenHeader = req.headers['x-csrf-token'];

    // For Register (no session yet), we need a different approach?
    // Wait, register usually creates a user.
    // If we want to protect Register against CSRF, we need a pre-login session/cookie.
    // Given the editor is a simpler tool, maybe we only protect authenticated actions?
    // The requirement said "protect the user creation endpoint with a CSRF Tokens".
    // To do this, the client must first fetch a temporary session/token just to register.
    // Or we use a Double Submit Cookie pattern just for the public endpoints.

    // Strategy for Register:
    // 1. Client calls GET /api/auth/csrf (creates a temp anonymous session)
    // 2. Client calls POST /api/auth/register with that token.

    let session = await getSession(req);

    if (!session) {
        // Try to handle anonymous CSRF for Register
        const anonToken = req.headers['x-anon-token'];
        if (anonToken) {
             session = await redis.getJson(`editor_anon:${anonToken}`);
        }
    }

    if (!session || !session.csrfToken) {
         return res.status(403).json({ error: "Missing security session." });
    }

    if (session.csrfToken !== csrfTokenHeader) {
         return res.status(403).json({ error: "Invalid security token." });
    }

    next();
}

// Public CSRF Endpoint (for Login/Register pages)
app.get('/api/auth/csrf', async (req, res) => {
    // Check if user is already logged in
    const user = await getSession(req);
    if (user && user.csrfToken) {
        return res.json({ csrfToken: user.csrfToken });
    }

    // Otherwise create anonymous token
    const anonToken = crypto.randomBytes(32).toString('hex');
    const csrfToken = crypto.randomBytes(32).toString('hex');
    await redis.setJson(`editor_anon:${anonToken}`, { csrfToken }, { EX: 3600 }); // 1 hour

    res.json({ anonToken, csrfToken });
});

// API: Register
app.post('/api/auth/register', verifyEditorCsrf, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Missing credentials" });

        // Basic Username Validation
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return res.status(400).json({ error: "Username can only contain letters, numbers, and underscores." });
        }

        const userKey = `user:${username}:hash`;
        const existing = await redis.get(userKey);
        if (existing) {
            return res.status(409).json({ error: "Username already taken." });
        }

        const hash = await bcrypt.hash(password, 10);
        await redis.set(userKey, hash);

        // Auto-login
        const token = crypto.randomBytes(32).toString('hex');
        const csrfToken = crypto.randomBytes(32).toString('hex');
        await redis.setJson(`editor_session:${token}`, { username, csrfToken });

        res.json({ success: true, token, username, csrfToken });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Me
app.get('/api/auth/me', async (req, res) => {
    const user = await getSession(req);
    res.json({ user: user ? user.username : null });
});


// --- STORY MANAGEMENT API ---

// Get all stories (Public)
app.get('/api/stories', (req, res) => {
    try {
        if (!fs.existsSync(STORIES_DIR)) {
            return res.json([]);
        }
        const dirs = fs.readdirSync(STORIES_DIR).filter(file => {
            return fs.statSync(path.join(STORIES_DIR, file)).isDirectory();
        });

        const stories = [];
        for (const dir of dirs) {
            const manifestPath = path.join(STORIES_DIR, dir, 'manifest.json');
            if (fs.existsSync(manifestPath)) {
                try {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                    stories.push(manifest);
                } catch (e) {
                    // Fallback if manifest is corrupt
                    stories.push({ id: dir, title: dir + ' (Corrupt Manifest)', description: 'Manifest error' });
                }
            } else {
                // Fallback if manifest missing
                stories.push({ id: dir, title: dir, description: 'No description' });
            }
        }

        res.json(stories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Load Bundle (Public - Fetch entire story for client-side editing)
app.get('/api/bundle/:storyId', (req, res) => {
    try {
        const { storyId } = req.params;

        // Sanitize ID - ALLOW SPACES
        if (!/^[a-zA-Z0-9 _-]+$/.test(storyId)) {
            return res.status(400).json({ error: "Invalid Story ID" });
        }

        const storyDir = path.join(STORIES_DIR, storyId);

        if (!fs.existsSync(storyDir)) return res.status(404).json({ error: "Story not found" });

        // Read Manifest
        let manifest = {};
        const manifestPath = path.join(storyDir, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        }

        // Read Nodes
        const nodesDir = path.join(storyDir, 'nodes');
        const nodes = [];
        if (fs.existsSync(nodesDir)) {
            const files = fs.readdirSync(nodesDir).filter(f => f.endsWith('.json'));
            for (const f of files) {
                nodes.push(JSON.parse(fs.readFileSync(path.join(nodesDir, f), 'utf8')));
            }
        }

        res.json({
            id: storyId,
            manifest,
            nodes
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Publish Bundle (Protected)
app.post('/api/publish', requireAuth, verifyEditorCsrf, async (req, res) => {
    try {
        const { id, manifest, nodes } = req.body;
        const username = req.user.username;

        if (!id || !manifest || !Array.isArray(nodes)) {
            return res.status(400).json({ error: "Invalid bundle format." });
        }

        // Sanitize ID (Security) - ALLOW SPACES
        if (!/^[a-zA-Z0-9 _-]+$/.test(id)) {
            return res.status(400).json({ error: "Story ID can only contain letters, numbers, spaces, hyphens, and underscores." });
        }

        // 1. Force authorId to match login (Implicit ownership)
        // We do NOT check if manifest.authorId matches, we just claim it.
        // This allows forking or updating without manually changing the JSON first.
        manifest.authorId = username;

        // 1.5 Validate Mandatory Fields (Manifest)
        const MANDATORY_MANIFEST_FIELDS = ['id', 'title', 'description', 'authorId', 'authorName', 'startNode', 'language', 'date'];
        const missingManifestFields = MANDATORY_MANIFEST_FIELDS.filter(field => !manifest[field]);
        if (missingManifestFields.length > 0) {
            return res.status(400).json({ error: `Manifest missing fields: ${missingManifestFields.join(', ')}` });
        }

        // 1.6 Validate Mandatory Fields (Nodes)
        const nodeIds = new Set(nodes.map(n => n.id));
        if (!nodeIds.has(manifest.startNode)) {
             return res.status(400).json({ error: `Start node '${manifest.startNode}' missing from nodes list.` });
        }

        for (const node of nodes) {
            if (!node.id) return res.status(400).json({ error: "A node is missing an ID." });

            // Must have text OR text_conditionals
            if (!node.text && (!node.text_conditionals || node.text_conditionals.length === 0)) {
                return res.status(400).json({ error: `Node '${node.id}' must have 'text' or 'text_conditionals'.` });
            }
        }

        const storyDir = path.join(STORIES_DIR, id);
        const manifestPath = path.join(storyDir, 'manifest.json');

        // 2. Check Existence & Ownership (File System is Truth)
        if (fs.existsSync(storyDir)) {
            // Story exists - Check if we own it
            if (fs.existsSync(manifestPath)) {
                const existingManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                if (existingManifest.authorId !== username) {
                    return res.status(403).json({ error: "You do not own this story. Cannot overwrite." });
                }
            } else {
                // If folder exists but no manifest, assume it's system or orphan.
                if (username !== ADMIN_USERNAME) {
                    return res.status(403).json({ error: "Cannot overwrite system story or story without manifest." });
                }
            }
        } else {
            // Create new story folder
            fs.mkdirSync(storyDir, { recursive: true });
        }

        // 3. Write Manifest
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

        // 4. Write Nodes
        const nodesDir = path.join(storyDir, 'nodes');
        if (!fs.existsSync(nodesDir)) fs.mkdirSync(nodesDir);

        // Security Check: Ensure nodesDir is actually inside storiesDir and not root
        if (!nodesDir.startsWith(STORIES_DIR)) {
             throw new Error("Security Error: Path traversal detected.");
        }

        // Clean up old nodes
        const oldFiles = fs.readdirSync(nodesDir);
        for (const f of oldFiles) {
             // Only delete JSON files to be safe
             if (f.endsWith('.json')) {
                fs.unlinkSync(path.join(nodesDir, f));
             }
        }

        for (const node of nodes) {
            // Allow spaces in Node IDs? Probably safer to stick to rigid IDs for nodes,
            // but let's allow spaces if the story has them.
            // Actually Node IDs act as filenames. Spaces in filenames are annoying but allowed.
            if (!/^[a-zA-Z0-9 _-]+$/.test(node.id)) {
                console.warn(`Skipping invalid node ID: ${node.id}`);
                continue;
            }
            const nodePath = path.join(nodesDir, `${node.id}.json`);
            fs.writeFileSync(nodePath, JSON.stringify(node, null, 2));
        }

        res.json({ success: true, message: "Story published successfully." });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Delete Story (Protected)
app.post('/api/story/:storyId/delete', requireAuth, verifyEditorCsrf, async (req, res) => {
    try {
        const { storyId } = req.params;
        const username = req.user.username;

        // Sanitize ID - ALLOW SPACES
        if (!/^[a-zA-Z0-9 _-]+$/.test(storyId)) {
            return res.status(400).json({ error: "Invalid Story ID" });
        }

        const storyDir = path.join(STORIES_DIR, storyId);

        if (!fs.existsSync(storyDir)) return res.status(404).json({ error: "Story not found" });

        // Ownership Check
        const manifestPath = path.join(storyDir, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            if (manifest.authorId !== username) {
                return res.status(403).json({ error: "You do not own this story." });
            }
        } else {
            if (username !== ADMIN_USERNAME) return res.status(403).json({ error: "Cannot delete unowned/system story." });
        }

        // Move to disabled
        if (!fs.existsSync(DISABLED_STORIES_DIR)) {
            fs.mkdirSync(DISABLED_STORIES_DIR, { recursive: true });
        }

        const targetPath = path.join(DISABLED_STORIES_DIR, storyId);
        if (fs.existsSync(targetPath)) {
             // If already exists in disabled, maybe rename? or Error?
             // Let's timestamp it
             const timestamp = Date.now();
             fs.renameSync(storyDir, path.join(DISABLED_STORIES_DIR, `${storyId}_deleted_${timestamp}`));
        } else {
             fs.renameSync(storyDir, targetPath);
        }

        res.json({ success: true, message: "Story moved to disabled folder." });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Docs
app.get('/api/docs', (req, res) => {
    try {
        if (fs.existsSync(DOCS_PATH)) {
            const content = fs.readFileSync(DOCS_PATH, 'utf8');
            res.send(content); // Send raw markdown
        } else {
            res.send("Documentation not found.");
        }
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// LEGACY ROUTES (KEEP FOR BACKWARD COMPAT IF NEEDED, BUT SECURE THEM)
// Get all nodes for a story (summary)
app.get('/api/nodes/:storyId', (req, res) => {
    try {
        const { storyId } = req.params;
        // Sanitize ID - ALLOW SPACES
        if (!/^[a-zA-Z0-9 _-]+$/.test(storyId)) return res.status(400).json({ error: "Invalid ID" });

        const nodesDir = path.join(STORIES_DIR, storyId, 'nodes');

        if (!fs.existsSync(nodesDir)) {
            return res.status(404).json({ error: "Story not found" });
        }

        const files = fs.readdirSync(nodesDir).filter(f => f.endsWith('.json'));
        const nodes = files.map(f => {
            const content = JSON.parse(fs.readFileSync(path.join(nodesDir, f), 'utf8'));
            return {
                id: content.id,
                text: content.text, // First few chars?
                filename: f
            };
        });
        res.json(nodes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get specific node
app.get('/api/node/:storyId/:nodeId', (req, res) => {
    try {
        const { storyId, nodeId } = req.params;
        // Sanitize ID - ALLOW SPACES
        if (!/^[a-zA-Z0-9 _-]+$/.test(storyId) || !/^[a-zA-Z0-9 _-]+$/.test(nodeId)) {
             return res.status(400).json({ error: "Invalid IDs" });
        }

        const filePath = path.join(STORIES_DIR, storyId, 'nodes', `${nodeId}.json`);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Node not found" });
        }

        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json(content);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Initialize and Start
async function startServer() {
    await redis.connect();
    await seedReservedUser();

    app.listen(PORT, () => {
        console.log(`
        ==========================================
        MAP EDITOR ONLINE
        PORT: ${PORT}
        Access the editor at: http://localhost:${PORT}
        ==========================================
        `);
    });
}

startServer();
