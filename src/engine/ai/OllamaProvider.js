const axios = require('axios');
const AIProvider = require('./AIProvider');

class OllamaProvider extends AIProvider {
    constructor(config = {}) {
        super(config);
        this.model = config.model || 'phi3:mini';
        this.host = config.host || 'http://localhost:11434';
        this.checkModelStatus();
    }

    async checkModelStatus() {
        try {
            console.log(`[AI-Ollama] Checking status of model '${this.model}' at ${this.host}...`);
            const response = await axios.get(`${this.host}/api/tags`);
            const models = response.data.models || [];
            const exists = models.some(m => m.name === this.model || m.name.startsWith(this.model));

            if (!exists) {
                console.warn(`[AI-Ollama] WARNING: Model '${this.model}' not found on Ollama server.`);
                console.log(`[AI-Ollama] Attempting to auto-pull '${this.model}' (this may take a while)...`);
                this.pullModel();
            } else {
                console.log(`[AI-Ollama] Model '${this.model}' is ready.`);
            }
        } catch (error) {
            console.warn(`[AI-Ollama] Could not connect to Ollama at ${this.host}. Is it running?`);
        }
    }

    async pullModel() {
        try {
            await axios.post(`${this.host}/api/pull`, { name: this.model, stream: false });
            console.log(`[AI-Ollama] Successfully pulled '${this.model}'.`);
        } catch (error) {
            console.error(`[AI-Ollama] Failed to pull model: ${error.message}`);
        }
    }

    async classifyIntent(userInput, storyIntents, globalIntents, contextDescription, contextNode) {
        // Ollama (Phi3) might struggle with full JSON, so we stick to the summarized prompt for now,
        // or we can try to conform to the new standard.
        // Let's keep the proven prompt structure for Ollama for now.

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

        console.log(`[AI-Ollama] Prompting for input: "${userInput}"`);

        try {
            const response = await axios.post(`${this.host}/api/generate`, {
                model: this.model,
                prompt: `${systemPrompt}\n\nPlayer Input: "${userInput}"\nIntent ID:`,
                stream: false,
                options: {
                    temperature: 0.1,
                    num_predict: 10
                }
            });

            const result = response.data.response.trim();
            console.log(`[AI-Ollama] Response: "${result}"`);

            const validIds = [...storyIntents, ...globalIntents].map(i => i.id);
            // Simple cleanup for Ollama sometimes adding punctuation
            const cleanResult = result.replace(/['".]/g, '');

            if (validIds.includes(cleanResult)) {
                return cleanResult;
            }

            // Fallback: check if result contains an ID
            const foundId = validIds.find(id => result.includes(id));
            if (foundId) return foundId;

            return 'unknown';

        } catch (error) {
            console.error("[AI-Ollama] Error:", error.message);
            return 'unknown';
        }
    }
}

module.exports = OllamaProvider;
