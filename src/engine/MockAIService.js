const AIService = require('./AIService');

class MockAIService extends AIService {
    async classifyIntent(userInput, storyIntents, globalIntents, contextDescription) {
        console.log(`[MOCK AI] User Input: "${userInput}"`);

        // Simple keyword matching for testing
        const lowerInput = userInput.toLowerCase();

        // Global Intents
        if (lowerInput.includes('look')) {
             if (globalIntents && globalIntents.some(i => i.id === 'global_look_around')) return 'global_look_around';
        }

        // Story Intents
        if (lowerInput.includes('examine') || lowerInput.includes('check') || lowerInput.includes('gear')) {
             // In intro, gear check
             if (storyIntents.some(i => i.id === 'examine_gear')) return 'examine_gear';
             if (storyIntents.some(i => i.id === 'examine_helmet')) return 'examine_helmet';
             if (storyIntents.some(i => i.id === 'examine_rock')) return 'examine_rock';
        }

        if (lowerInput.includes('exit') || lowerInput.includes('leave') || lowerInput.includes('step out') || lowerInput.includes('go north')) {
             return 'exit_elevator';
        }

        if (lowerInput.includes('drill') || lowerInput.includes('go to drill') || lowerInput.includes('approach')) {
             return 'go_drill_site';
        }

        if (lowerInput.includes('fissure') || lowerInput.includes('east') || lowerInput.includes('investigate')) {
             return 'investigate_fissure';
        }

        if (lowerInput.includes('plant') || lowerInput.includes('thumper') || lowerInput.includes('comply')) {
             return 'plant_thumper';
        }

        if (lowerInput.includes('deeper') || lowerInput.includes('push')) {
             return 'go_deeper';
        }

        if (lowerInput.includes('restart')) {
            return 'restart';
        }

        return 'unknown';
    }
}

module.exports = MockAIService;
