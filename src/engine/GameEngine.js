const path = require('path');
const redis = require('./RedisClient');

class GameEngine {
    constructor(aiService, sessionManager, pluginManager) {
        this.ai = aiService;
        this.sessions = sessionManager;
        this.plugins = pluginManager;
        this.storiesPath = path.join(process.cwd(), 'stories');
        this.redis = redis;

        this.globalIntents = [
            {
                id: 'global_look_around',
                ai_intent_helper: "The user wants to look around, inspect the surroundings, or see what is visible.",
                intent_description: "Look around"
            },
            {
                id: 'global_inventory',
                ai_intent_helper: "The user wants to check their inventory or see what they are carrying.",
                intent_description: "Check inventory"
            },
            {
                id: 'global_status',
                ai_intent_helper: "The user wants to check their overall status, health, or active effects.",
                intent_description: "Check status"
            }
        ];
    }

    /**
     * Starts a new story for a session.
     */
    async startStory(sessionId, storyId) {
        let session = await this.sessions.getSession(sessionId);
        // If session doesn't exist yet, create a fresh one in-place
        if (!session) {
            console.warn(`[GameEngine] Session ${sessionId} not found. Creating fresh session.`);
            session = {
                id: sessionId,
                createdAt: new Date().toISOString()
            };
        }
        // Load Manifest from Redis (fallback handled in load if needed, but we expect preload)
        console.log("[GameEngine] loading manifest " + `story:${storyId}:manifest ...`);
        const manifest = await this.redis.getJson(`story:${storyId}:manifest`);
        if (!manifest) throw new Error(`Story ${storyId} not found (Manifest missing in Redis)`);
        console.log("[GameEngine] loaded manifest " + `story:${storyId}:manifest`);
        session.currentStory = storyId;
        session.currentNodeId = manifest.startNode;
        session.history = [];
        session.state = {};
        session.inventory = [];
        session.visitedNodes = [];
        session.revealedItems = [];
        session.failCount = 0;

        // Load initial node and handle visitation logic
        const node = await this.loadNode(storyId, manifest.startNode);
        const text = this.resolveNodeText(node, session);

        await this.sessions.saveSession(sessionId, session);

        return {
            text: text,
            type: 'intro',
            isAiGenerated: false
        };
    }

    async loadNode(storyId, nodeId) {
        console.log("[GameEngine] loadnode: " + `story:${storyId}:node:${nodeId}`);
        // Try Redis first (and ideally only, since we preload)
        const node = await this.redis.getJson(`story:${storyId}:node:${nodeId}`);
        if (node) return node;

        throw new Error(`Node ${nodeId} missing for story ${storyId}`);
    }

    resolveNodeText(node, session) {
        let text = node.text;

        // Ensure visitedNodes exists (migration for old sessions)
        if (!session.visitedNodes) session.visitedNodes = [];
        if (!session.revealedItems) session.revealedItems = [];
        if (!session.inventory) session.inventory = [];
        if (!session.state) session.state = {};

        if (session.visitedNodes.includes(node.id)) {
            if (node.text_revisit) {
                text = node.text_revisit;
            }
        } else {
            session.visitedNodes.push(node.id);
        }

        // Handle text_conditionals
        if (node.text_conditionals) {
            for (const conditional of node.text_conditionals) {
                let match = true;
                if (conditional.if_state) {
                    for (const [key, value] of Object.entries(conditional.if_state)) {
                        if (session.state[key] !== value) {
                            match = false;
                            break;
                        }
                    }
                }
                if (match) {
                    text = conditional.text;
                    break; // Stop at first match
                }
            }
        }

        return text;
    }

    /**
     * Helper to get valid intents for the current session state.
     * Used by handleInput and getAvailableIntents.
     */
    _getValidIntents(session, node) {
        const storyIntents = node.intents.filter(intent => {
            if (intent.requires) {
                const hasAll = intent.requires.every(req => session.inventory.includes(req));
                if (!hasAll) return false;
            }
            if (intent.requires_not) {
                const hasForbidden = intent.requires_not.some(req => session.inventory.includes(req));
                if (hasForbidden) return false;
            }
            if (intent.requires_state) {
                for (const [key, value] of Object.entries(intent.requires_state)) {
                    if (session.state[key] !== value) return false;
                }
            }
            if (intent.requires_not_state) {
                for (const [key, value] of Object.entries(intent.requires_not_state)) {
                    if (session.state[key] === value) return false;
                }
            }
            if (intent.action === 'pickup' && intent.item_id) {
                if (session.inventory.includes(intent.item_id)) return false;
            }
            return true;
        });

        return [...storyIntents, ...this.globalIntents];
    }

    async getAvailableIntents(sessionId) {
        const session = await this.sessions.getSession(sessionId);
        if (!session || !session.currentStory || !session.currentNodeId) return [];

        const currentNode = await this.loadNode(session.currentStory, session.currentNodeId);
        const validIntents = this._getValidIntents(session, currentNode);

        return validIntents
            .filter(i => i.intent_description)
            .map(i => ({
                id: i.id,
                intent_description: i.intent_description
            }));
    }

    async handleInput(sessionId, userInput) {
        console.log(`[GameEngine] Handling input for session ${sessionId}: "${userInput}"`);
        let session = await this.sessions.getSession(sessionId);
        if (!session) {
            console.warn(`[GameEngine] Session ${sessionId} not found (Expired or Invalid).`);
            // Stop auto-starting default stories to prevent cross-talk bugs
            return {
                error: 'SESSION_EXPIRED',
                text: 'Connection lost. Session expired.',
                type: 'error'
            };
        }

        // PLUGIN HOOK: game:beforeInput
        if (this.plugins) {
            const hookResponse = await this.plugins.executeHook('firstResult', 'game:beforeInput', session, userInput);
            if (hookResponse) {
                return hookResponse;
            }
        }

        const currentNode = await this.loadNode(session.currentStory, session.currentNodeId);

        // 0. Dev/Debug Commands
        if (process.env.NODE_ENV === 'development' && userInput.trim() === 'debug') {
            return {
                text: JSON.stringify(currentNode, null, 2),
                type: 'info'
            };
        }

        // 1. Prepare Intents using helper
        const validIntents = this._getValidIntents(session, currentNode);

        // Split for legacy usage (AI service expects separate lists, though logic could be unified)
        const storyIntents = validIntents.filter(i => !i.id.startsWith('global_'));
        const globalIntents = validIntents.filter(i => i.id.startsWith('global_'));

        // 2. Intent Classification (Cached vs AI)
        const sanitizedInput = userInput.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
        const intentCacheKey = `intent_cache:${session.currentStory}:${session.currentNodeId}:${sanitizedInput}`;

        // Store last input details for correction feature
        session.lastInput = sanitizedInput;
        session.lastInputTimestamp = Date.now();
        // We save session at end of function, but we should make sure this data persists even if flow exits early?
        // Logic below saves session in most branches.

        let intentId = await this.redis.get(intentCacheKey);
        let isOptimized = false; // Default false for Cache HIT
        let isAiGenerated = false;

        if (intentId) {
            console.log(`[GameEngine] CACHE HIT: Intent for "${userInput}" found: ${intentId}`);
            isOptimized = false;
            // Even if cached, it originated from AI logic usually, but the challenge button relies on us wanting to correct the interpretation.
            // If it's cached, we might still want to correct it if the cache is wrong.
            // However, the prompt says "isAiGenerated" flag controls challenge button.
            // If we corrected it, it's "fixed". But user might want to re-challenge?
            // "option to challenge that it has been cached and re-assign caching"
            // So we definitely want challenge on cached items too.
            // Let's treat "AI Intent Classification" results (cached or new) as challengeable.
            isAiGenerated = true;
        } else {
            console.log(`[GameEngine] CACHE MISS: Asking AI for intent...`);
            intentId = await this.ai.classifyIntent(
                userInput,
                storyIntents,
                globalIntents,
                this.resolveNodeText(currentNode, session),
                currentNode
            );

            // Cache MISS means AI was used, so we set optimized=true (meaning it's now optimized for next time)
            isOptimized = true;
            isAiGenerated = true;

            if (intentId && intentId !== 'unknown') {
                // Cache the result
                await this.redis.set(intentCacheKey, intentId);
                console.log(`[GameEngine] Caching intent mapping: ${sanitizedInput} -> ${intentId}`);
            }
        }

        // 3. Handle Global Intents
        if (intentId === 'global_look_around') {
            const visibleItems = storyIntents.filter(intent => {
                if (!intent.text_description) return false;
                if (intent.visible === false) {
                    return session.revealedItems && session.revealedItems.includes(intent.id);
                }
                return true;
            });

            const descriptionText = visibleItems.map(i => i.text_description).join('\n');
            await this.sessions.saveSession(sessionId, session);
            return this._wrapResponse({
                text: descriptionText || "You see nothing of interest.",
                type: 'info',
                optimized: isOptimized,
                isAiGenerated
            }, session);
        }

        if (intentId === 'global_inventory') {
            const invText = session.inventory.length > 0
                ? "You are carrying: " + session.inventory.join(', ')
                : "You are not carrying anything.";
            await this.sessions.saveSession(sessionId, session);
            return this._wrapResponse({
                text: invText,
                type: 'info',
                optimized: isOptimized,
                isAiGenerated
            }, session);
        }

        if (intentId === 'global_status') {
            const statusText = `Status Report:\n- Health: ${session.state.health || 'OK'}\n- Inventory: ${session.inventory.length} items\n- Visited Locations: ${session.visitedNodes.length}`;
            await this.sessions.saveSession(sessionId, session);
            return this._wrapResponse({
                text: statusText,
                type: 'info',
                optimized: isOptimized,
                isAiGenerated
            }, session);
        }

        // 4. Execute Logic based on Intent
        if (intentId === 'unknown') {
            session.failCount = (session.failCount || 0) + 1;
            let responseText = "There is no response.";

            if (session.failCount >= 3) {
                const randomIntent = storyIntents[Math.floor(Math.random() * storyIntents.length)];
                if (randomIntent) {
                    const desc = (randomIntent.ai_intent_helper || "").toLowerCase().replace(/^the user wants to /, '').replace(/^the user /, '');
                    responseText = `Nothing happens.\n\n[TIP: Try something like "${desc}"]`;
                }
                session.failCount = 0;
            }

            await this.sessions.saveSession(sessionId, session);
            return this._wrapResponse({
                text: responseText,
                type: 'info',
                optimized: isOptimized,
                isAiGenerated
            }, session);
        }

        // Reset fail count on success
        session.failCount = 0;
        const matchedIntent = validIntents.find(i => i.id === intentId);

        if (!matchedIntent) {
            await this.sessions.saveSession(sessionId, session); // Save even on error to persist inputs
            return this._wrapResponse({ text: "System Error: AI returned invalid intent ID.", type: 'error', optimized: isOptimized, isAiGenerated }, session);
        }

        // PLUGIN HOOK: game:willResolveIntent
        if (this.plugins) {
            const hookResult = await this.plugins.executeHook('firstResult', 'game:willResolveIntent', session, matchedIntent, currentNode);
            if (hookResult) {
                await this.sessions.saveSession(sessionId, session);
                return this._wrapResponse(hookResult, session);
            }
        }

        if (matchedIntent.set_state) {
            if (!session.state) session.state = {};
            for (const [key, value] of Object.entries(matchedIntent.set_state)) {
                session.state[key] = value;
            }
        }

        let appendedDescription = "";
        if (matchedIntent.reveals) {
            if (!session.revealedItems) session.revealedItems = [];
            matchedIntent.reveals.forEach(itemId => {
                if (!session.revealedItems.includes(itemId)) {
                    session.revealedItems.push(itemId);
                }
            });

            const newlyRevealed = storyIntents.filter(intent => matchedIntent.reveals.includes(intent.id));
            newlyRevealed.forEach(item => {
                if (item.text_description && !session.inventory.includes(item.item_id)) {
                    appendedDescription += "\n" + item.text_description;
                }
            });
        }

        if (matchedIntent.action === 'pickup') {
            if (!session.inventory) session.inventory = [];
            if (matchedIntent.item_id && !session.inventory.includes(matchedIntent.item_id)) {
                session.inventory.push(matchedIntent.item_id);
            }
            await this.sessions.saveSession(sessionId, session);
            return this._wrapResponse({
                text: matchedIntent.response || `You picked up ${matchedIntent.item_id}.`,
                type: 'info',
                optimized: isOptimized,
                isAiGenerated
            }, session);
        }

        if (matchedIntent.action === 'transition') {
            session.currentNodeId = matchedIntent.target;
            const nextNode = await this.loadNode(session.currentStory, session.currentNodeId);
            const text = this.resolveNodeText(nextNode, session);

            await this.sessions.saveSession(sessionId, session);
            return this._wrapResponse({
                text: text,
                type: 'story',
                optimized: isOptimized,
                isAiGenerated
            }, session);
        } else if (matchedIntent.action === 'text') {
            await this.sessions.saveSession(sessionId, session);
            return this._wrapResponse({
                text: matchedIntent.response + appendedDescription,
                type: 'info',
                optimized: isOptimized,
                isAiGenerated
            }, session);
        } else if (matchedIntent.action === 'end_game') {
            // Mark session as complete
            session.finished = true;
            await this.sessions.saveSession(sessionId, session);

            // Archive session to disabled state
            await this.sessions.archiveSession(sessionId);

            // Fetch Author Info
            const manifest = await this.redis.getJson(`story:${session.currentStory}:manifest`);
            const authorName = manifest ? manifest.authorName : 'Unknown';
            const authorId = manifest ? manifest.authorId : 'unknown';

            return this._wrapResponse({
                text: matchedIntent.response,
                type: 'end',
                redirect: 'http://baseline-engine.com', // Updated URL
                optimized: isOptimized,
                isAiGenerated,
                authorName,
                authorId
            }, session);
        }

        await this.sessions.saveSession(sessionId, session);
        return this._wrapResponse({ text: "System Error: Action undefined.", type: 'error', optimized: isOptimized }, session);
    }

    async _wrapResponse(response, session) {
        // PLUGIN HOOK: game:afterInput / game:onResponse
        if (this.plugins) {
            return await this.plugins.executeHook('waterfall', 'game:afterInput', response, session);
        }
        return response;
    }
}

module.exports = GameEngine;
