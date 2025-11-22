/**
 * Base class for AI Providers.
 * All providers must implement `classifyIntent`.
 */
class AIProvider {
    constructor(config = {}) {
        this.config = config;
    }

    /**
     * Determines the user's intent.
     * @param {string} userInput - The player's text input.
     * @param {Array} storyIntents - Array of intent objects from the current story node.
     * @param {Array} globalIntents - Array of global/system intent objects.
     * @param {string} contextDescription - Text description of the current scene.
     * @param {Object} contextNode - The full JSON object of the current node (optional, for advanced models).
     * @returns {Promise<string>} - The ID of the matched intent, or 'unknown'.
     */
    async classifyIntent(userInput, storyIntents, globalIntents, contextDescription, contextNode) {
        throw new Error("classifyIntent must be implemented by subclass");
    }
}

module.exports = AIProvider;
