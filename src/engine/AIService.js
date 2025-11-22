const axios = require('axios');

class AIService {
    constructor(model = 'phi3:mini', host = 'http://localhost:11434') {
        this.model = model;
        this.host = host;
        this.checkModelStatus();
    }

    async checkModelStatus() {
        try {
            console.log(`[AI] Checking status of model '${this.model}' at ${this.host}...`);
            const response = await axios.get(`${this.host}/api/tags`);
            const models = response.data.models || [];
            const exists = models.some(m => m.name === this.model || m.name.startsWith(this.model));

            if (!exists) {
                console.warn(`[AI] WARNING: Model '${this.model}' not found on Ollama server.`);
                console.log(`[AI] Attempting to auto-pull '${this.model}' (this may take a while)...`);
                this.pullModel();
            } else {
                console.log(`[AI] Model '${this.model}' is ready.`);
            }
        } catch (error) {
            console.warn(`[AI] Could not connect to Ollama at ${this.host}. Is it running?`);
        }
    }

    async pullModel() {
        try {
            await axios.post(`${this.host}/api/pull`, { name: this.model, stream: false });
            console.log(`[AI] Successfully pulled '${this.model}'.`);
        } catch (error) {
            console.error(`[AI] Failed to pull model: ${error.message}`);
        }
    }

    /**
     * Determines the user's intent based on the current context.
     * @param {string} userInput - The raw text from the player.
     * @param {Array} storyIntents - specific intents for the current node.
     * @param {Array} globalIntents - global intents (look around, inventory, etc).
     * @param {string} contextDescription - Brief description of the current room/situation.
     * @returns {Promise<string>} - The ID of the matched intent, or 'unknown'.
     */
    async classifyIntent(userInput, storyIntents, globalIntents, contextDescription) {
        const systemPrompt = `You are a strict Game Engine Intent Classifier.
Your job is to map the Player's Input to one of the valid Intents based on the Current Context.

Current Context: "${contextDescription}"

PRIMARY INTENTS (Story Actions) - Prioritize these if the user is attempting a specific action described here:
${storyIntents.map(i => `- ID: "${i.id}" | Description: ${i.description}`).join('\n')}

GLOBAL INTENTS (General Actions) - specific actions usually override these:
${globalIntents.map(i => `- ID: "${i.id}" | Description: ${i.description}`).join('\n')}

Instructions:
1. Analyze the Player's Input.
2. If the input matches a PRIMARY INTENT, return that ID.
3. If the input is generic (like "look around", "help"), check GLOBAL INTENTS.
4. If the input is ambiguous or does not match any intent, return "unknown".
5. Do NOT output any explanation, just the ID.`;


        try {
            const response = await axios.post(`${this.host}/api/generate`, {
                model: this.model,
                prompt: `${systemPrompt}\n\nPlayer Input: "${userInput}"\nIntent ID:`,
                stream: false,
                options: {
                    temperature: 0.1, // Low temperature for deterministic classification
                    num_predict: 10
                }
            });

            const result = response.data.response.trim();
            console.log(`[AI] Input: "${userInput}" -> Output: "${result}"`);

            // Sanity check: ensure result is one of the valid IDs or unknown
            const validIds = [...storyIntents, ...globalIntents].map(i => i.id);
            if (validIds.includes(result)) {
                return result;
            }
            return 'unknown';

        } catch (error) {
            console.error("AI Service Error:", error.message);
            // Fallback for dev/offline modes
            return 'unknown';
        }
    }
}

module.exports = AIService;
